import { Role, Source, AiUsageStep } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import { getThreadDetailsQuery as getThreadDetails } from '@/features/threads/services/queries/get-thread-details-query';
import {
  createAndStoreMessageCommand as createAndStoreMessage,
  createMessageInDbCommand as createMessageInDB,
} from '@/features/messages/services/commands/create-message-command';
import { type ApiSseMessageEvent } from '@/features/threads/contracts/events.types';
import { logger } from '../../../lib/utils/logger';
import { initializeRagChain } from './initializeBasicRag';
import { initializeConversationChain } from '../services/initializeConversationChain';
import { getAllSettings } from '@/features/organizations/services/organization-settings';
import { ApiKeyError } from '@/libs/chains/errors';
import { SseExceptionFilter } from '../services/sseExceptionFilter';
import {
  ChatType,
  type CreateMessageDto,
} from '@/features/messages/contracts/message.types';
import { sendApiEvent } from '@/libs/sse/prepare-sse-message';
import { initializePublicRagChain } from '../../guest-threads/[...guestDetails]/services/initializePublicBasicRag';
import { AssistantMode } from '@/features/assistants/contracts/assistant.types';
import { getProjectInstructionQuery as getProjectInstruction } from '@/features/projects/services/queries/get-project-instruction-query';
import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import type { BaseChatChainOutput } from '@/libs/chains/types/common';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import { getCurrentUserId } from '@/app/lib/utils/auth-helpers';
import { getModelProvider, normalizeModelId } from '@/app/components/config';
import { getEnabledConnectorsQuery } from '@/features/connectors/services/queries/get-enabled-connectors-query';
import { createMcpToolsFromConnectors } from '@/libs/mcp/client';
import { observe, updateActiveTrace } from '@langfuse/tracing';

/**
 * Load thread documents from database for a specific thread
 */
async function loadThreadDocuments(
  threadId: string,
): Promise<ThreadDocumentUI[]> {
  try {
    const threadDocuments = await db.threadDocument.findMany({
      where: { thread_id: threadId },
      include: {
        userFile: {
          select: {
            public_id: true,
            file_name: true,
            file_size: true,
            file_mime_type: true,
            document: {
              select: {
                content: true,
              },
            },
          },
        },
      },
    });

    logger.info(
      {
        threadId,
        threadDocumentsFound: threadDocuments.length,
        userFileIds: threadDocuments.map((td) => td.userFile.public_id),
        fileNames: threadDocuments.map((td) => td.userFile.file_name),
      },
      'loadThreadDocuments: Retrieved thread documents from database',
    );

    const threadDocumentsUI: ThreadDocumentUI[] = threadDocuments.map((td) => ({
      name: td.userFile.file_name,
      content: td.userFile.document?.content || '',
      size: td.userFile.file_size,
      type: td.userFile.file_mime_type || 'application/octet-stream',
      userFileId: td.userFile.public_id,
    }));

    return threadDocumentsUI;
  } catch (error) {
    logger.error(
      { error, threadId },
      'loadThreadDocuments: Error loading thread documents from database',
    );
    return [];
  }
}

/**
 * Merge DB-loaded thread documents with inline documents from the request body.
 * Inline documents take priority for content when DB documents have empty content
 * (e.g., async Temporal processing hasn't completed yet).
 */
function mergeThreadDocuments(
  dbDocs: ThreadDocumentUI[],
  inlineDocs: ThreadDocumentUI[],
): ThreadDocumentUI[] {
  if (inlineDocs.length === 0) {
    return dbDocs;
  }
  if (dbDocs.length === 0) {
    return inlineDocs;
  }

  // Build a map of inline docs by userFileId for quick lookup
  const inlineByFileId = new Map<string, ThreadDocumentUI>();
  for (const doc of inlineDocs) {
    if (doc.userFileId) {
      inlineByFileId.set(doc.userFileId, doc);
    }
  }

  // For each DB doc, use inline content if DB content is empty
  const merged = dbDocs.map((dbDoc) => {
    if (dbDoc.content) {
      return dbDoc;
    }

    const inlineDoc = dbDoc.userFileId
      ? inlineByFileId.get(dbDoc.userFileId)
      : undefined;

    if (inlineDoc?.content) {
      return { ...dbDoc, content: inlineDoc.content };
    }
    return dbDoc;
  });

  // Add any inline docs not present in DB (e.g., docs without userFileId)
  const dbFileIds = new Set(dbDocs.map((d) => d.userFileId).filter(Boolean));
  for (const doc of inlineDocs) {
    if (!doc.userFileId || !dbFileIds.has(doc.userFileId)) {
      merged.push(doc);
    }
  }

  return merged;
}

type Config = {
  publicThreadId: string;
  userMessage: CreateMessageDto;
  orgId: string;
  mode: AssistantMode;
  filteredMode?: ChatType;
  visitorId?: string;
  projectId?: number;
};

type ThreadRecord = Awaited<ReturnType<typeof getThreadDetails>>;

async function resolveProjectInstruction(
  threadRecord: ThreadRecord,
  orgId: string,
  rawSettings: { model: string },
  effectiveSettings: { prompt: string; model: string },
): Promise<{ instruction: string | null; projectPublicId: string | null }> {
  let projectInstruction: string | null = null;
  let effectiveProjectPublicId: string | null = null;

  try {
    // 1. HIGHEST PRIORITY: Mentioned project (via @ mention)
    if (threadRecord.mentioned_project_id) {
      const mentionedProject = await db.project.findFirst({
        where: {
          id: threadRecord.mentioned_project_id,
          organization_id: orgId,
        },
        select: { id: true, public_id: true, title: true },
      });

      if (mentionedProject) {
        try {
          projectInstruction = await getProjectInstruction(
            mentionedProject.public_id,
          );
          effectiveProjectPublicId = mentionedProject.public_id;

          logger.info(
            {
              mentionedProjectId: threadRecord.mentioned_project_id,
              mentionedProjectPublicId: mentionedProject.public_id,
              hasInstruction: Boolean(projectInstruction),
            },
            'Using instructions from mentioned project (highest priority)',
          );
        } catch (error) {
          logger.error(
            {
              err: error,
              mentionedProjectId: threadRecord.mentioned_project_id,
              mentionedProjectPublicId: mentionedProject.public_id,
            },
            'Error getting instructions from mentioned project, falling back to thread project',
          );
        }
      } else {
        logger.warn(
          { mentionedProjectId: threadRecord.mentioned_project_id },
          'Mentioned project not found, falling back to thread project',
        );
      }
    }

    // 2. MEDIUM PRIORITY: Thread project
    if (
      !projectInstruction &&
      threadRecord.project_id &&
      threadRecord.project?.public_id
    ) {
      try {
        projectInstruction = await getProjectInstruction(
          threadRecord.project.public_id,
        );
        effectiveProjectPublicId = threadRecord.project.public_id;

        logger.info(
          {
            internalProjectId: threadRecord.project_id,
            publicProjectId: threadRecord.project.public_id,
            hasInstruction: Boolean(projectInstruction),
          },
          'Using instructions from thread project (medium priority)',
        );
      } catch (error) {
        logger.error(
          {
            err: error,
            projectId: threadRecord.project_id,
            publicProjectId: threadRecord.project?.public_id,
          },
          'Error getting instructions from thread project, will use organization instructions',
        );
      }
    } else if (!projectInstruction && threadRecord.project_id) {
      logger.warn(
        { projectId: threadRecord.project_id },
        'Project associated with thread, but missing public_id',
      );
    }

    // 3. LOWEST PRIORITY: Organization instructions (handled by chain initialization)
    if (!projectInstruction) {
      logger.info(
        {
          orgId,
          hasOrgPrompt: Boolean(effectiveSettings.prompt),
          effectiveModel: effectiveSettings.model,
          threadModel: threadRecord.preferred_model,
          orgDefaultModel: rawSettings.model,
        },
        'No project instructions found, will use organization instructions (lowest priority fallback)',
      );
    }
  } catch (error) {
    logger.error(
      { err: error },
      'Error in project instruction resolution, using organization fallback',
    );
  }

  return {
    instruction: projectInstruction,
    projectPublicId: effectiveProjectPublicId,
  };
}

export async function streamEvents({
  publicThreadId,
  userMessage,
  orgId,
  mode,
  filteredMode,
  visitorId,
}: Config) {
  return new ReadableStream({
    start: observe(
      async function chatStream(controller) {
        sendApiEvent(controller, 'init');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let mcpTools: Record<string, any> = {};
        let mcpContext = '';
        let closeMcpClients: (() => Promise<void>) | undefined;

        try {
          // Phase 1: Fetch settings and thread details (with messages) in parallel
          sendApiEvent(controller, 'find_thread');

          const [rawSettings, threadRecord] = await Promise.all([
            getAllSettings(orgId),
            getThreadDetails(publicThreadId, orgId, {
              includeMessages: true,
            }),
          ]);

          if (!rawSettings.apiKey) {
            throw new ApiKeyError();
          }

          sendApiEvent(controller, 'thread_found', {
            id: threadRecord.public_id,
          });

          const effectiveSettings = {
            apiKey: rawSettings.apiKey,
            model: threadRecord.preferred_model || rawSettings.model,
            temperature: rawSettings.temperature,
            prompt: rawSettings.prompt,
            maxDocumentsToRetrieve: rawSettings.maxDocumentsToRetrieve,
            voiceId: rawSettings.voiceId,
          };

          // Build conversation history from thread record (no separate DB query needed)
          const conv_history =
            'messages' in threadRecord && Array.isArray(threadRecord.messages)
              ? (threadRecord.messages as { role: string; content: string }[])
                  .map((msg) => `${msg.role}: ${msg.content}`)
                  .join('\n')
              : undefined;

          // Phase 2: Save user message + resolve project instructions + load thread docs in parallel
          sendApiEvent(controller, 'save_user_message');
          sendApiEvent(controller, 'init_lmm');

          const phase2Promises: [
            Promise<Awaited<ReturnType<typeof createAndStoreMessage>>>,
            Promise<{
              instruction: string | null;
              projectPublicId: string | null;
            }>,
            Promise<ThreadDocumentUI[]>,
          ] = [
            createAndStoreMessage({
              threadId: threadRecord.id,
              prompt: userMessage.prompt,
              visitorId,
              messageType: userMessage.messageType,
              voiceDurationSeconds: userMessage.voiceDurationSeconds,
            }),
            resolveProjectInstruction(
              threadRecord,
              orgId,
              rawSettings,
              effectiveSettings,
            ),
            loadThreadDocuments(threadRecord.id),
          ];

          const [threadMessage, projectResult, dbThreadDocuments] =
            await Promise.all(phase2Promises);

          if (!threadMessage) {
            logger.error('Thread message not found');
            controller.close();
            return;
          }

          // Load MCP tools from user's enabled connectors (skip for public mode)
          const userId =
            mode !== AssistantMode.PUBLIC
              ? await getCurrentUserId().catch(() => null)
              : null;

          if (userId) {
            try {
              const connectors = await getEnabledConnectorsQuery(orgId, userId);
              if (connectors.length > 0) {
                const { tools, closeAll } =
                  await createMcpToolsFromConnectors(connectors);
                mcpTools = tools;
                closeMcpClients = closeAll;

                // Build context so the AI knows the customer_id for each connector
                const customerIds = connectors.map(
                  (c) =>
                    `- ${c.provider} tools: use customer_id="${c.customer_id}"`,
                );
                const timeZone =
                  Intl.DateTimeFormat().resolvedOptions().timeZone;
                const currentDateTime = new Date().toLocaleString('en-US', {
                  timeZone,
                  dateStyle: 'full',
                  timeStyle: 'long',
                });
                mcpContext = `You have access to external tools via connected integrations. When calling these tools, use the following customer_id values:\n${customerIds.join('\n')}\n\nCurrent date and time: ${currentDateTime} (timezone: ${timeZone}). Use this to resolve relative dates like "today", "tomorrow", "this week", etc. when calling calendar or other time-based tools. Always provide both time_min and time_max for calendar queries to get precise results.`;

                logger.info(
                  { toolCount: Object.keys(tools).length },
                  'MCP tools loaded for chat session',
                );
              }
            } catch (error) {
              logger.error(
                { err: error },
                'Failed to load MCP tools, continuing without them',
              );
            }
          }

          sendApiEvent(controller, 'user_message_saved', {
            id: threadMessage.public_id,
          });

          sendApiEvent(controller, 'user_message_created', {
            id: threadMessage.public_id,
          });

          const {
            instruction: projectInstruction,
            projectPublicId: effectiveProjectPublicId,
          } = projectResult;

          // Phase 3: Check usage limits before proceeding
          const { checkUsageLimitsQuery } =
            await import('@/features/ai-usage/services/queries/check-usage-limits-query');
          const usageLimitStatus = await checkUsageLimitsQuery(orgId);
          if (usageLimitStatus.isAnyLimitExceeded) {
            const reasons: string[] = [];
            if (usageLimitStatus.exceeded.tokens) {
              reasons.push('token limit');
            }
            if (usageLimitStatus.exceeded.cost) {
              reasons.push('cost limit');
            }
            if (usageLimitStatus.exceeded.messages) {
              reasons.push('message limit');
            }
            throw new Error(
              `Monthly usage limit exceeded: ${reasons.join(', ')}. Please contact your organization administrator.`,
            );
          }

          // Phase 4: Initialize the appropriate chain
          let chainOutput: BaseChatChainOutput | undefined = undefined;

          // Set Langfuse trace context (user, session, tags)
          const trackedModelId = effectiveSettings.model || '';
          const trackedProvider =
            getModelProvider(normalizeModelId(trackedModelId)) || 'openrouter';
          const traceTags = [
            `provider:${trackedProvider}`,
            `model:${trackedModelId}`,
          ];
          updateActiveTrace({
            name: `chat-${mode === AssistantMode.PUBLIC ? 'public' : filteredMode === ChatType.CONVERSATION ? 'conversation' : 'rag'}`,
            input: userMessage.prompt,
            userId: userId ?? undefined,
            sessionId: `${orgId}:${threadRecord.public_id}`,
            tags: traceTags,
          });

          if (mode === AssistantMode.INTERNAL) {
            if (filteredMode === ChatType.CONVERSATION) {
              chainOutput = await initializeConversationChain({
                settings: {
                  ...effectiveSettings,
                  apiKey: effectiveSettings.apiKey,
                },
                projectInstruction,
                mcpTools,
                mcpContext,
                tracking: {
                  organizationId: orgId,
                  projectId: threadRecord.project_id,
                  userId,
                },
              });
            } else {
              const projectIdToUse =
                threadRecord.mentioned_project_id || threadRecord.project_id;
              const projectPublicIdToUse =
                effectiveProjectPublicId || threadRecord.project?.public_id;

              const inlineThreadDocuments = userMessage.threadDocuments || [];
              const threadDocuments = mergeThreadDocuments(
                dbThreadDocuments,
                inlineThreadDocuments,
              );

              chainOutput = await initializeRagChain({
                settings: {
                  ...effectiveSettings,
                  apiKey: effectiveSettings.apiKey,
                },
                orgId,
                userId,
                projectInstruction,
                projectId: projectIdToUse ?? null,
                projectPublicId: projectPublicIdToUse ?? null,
                threadDocuments,
                mcpTools,
                mcpContext,
              });
            }
          } else if (mode === AssistantMode.PUBLIC) {
            const projectPublicIdToUse =
              effectiveProjectPublicId || threadRecord.project?.public_id;
            chainOutput = await initializePublicRagChain({
              settings: {
                ...effectiveSettings,
                apiKey: effectiveSettings.apiKey,
              },
              organizationId: orgId,
              projectInstruction,
              projectPublicId: projectPublicIdToUse,
            });
          }

          if (!chainOutput) {
            if (closeMcpClients) {
              closeMcpClients().catch((err) =>
                logger.error({ err }, 'Error closing MCP clients'),
              );
            }
            sendApiEvent(controller, 'close');
            controller.close();
            return;
          }

          // Phase 4: Run chain with streaming
          sendApiEvent(controller, 'start_lmm');

          const streamResult = await chainOutput.stream({
            question: threadMessage.content,
            chat_history: conv_history,
          });

          let fullMessage = '';
          const usedToolNames = new Set<string>();

          for await (const part of streamResult.fullStream) {
            switch (part.type) {
              case 'text-delta':
                fullMessage += part.textDelta;
                sendApiEvent(controller, 'delta', {
                  content: part.textDelta,
                });
                break;
              case 'reasoning-start':
                sendApiEvent(controller, 'reasoning_start');
                break;
              case 'reasoning-delta':
                sendApiEvent(controller, 'reasoning_delta', {
                  content: part.delta,
                });
                break;
              case 'reasoning-end':
                sendApiEvent(controller, 'reasoning_end');
                break;
              case 'tool-call':
                usedToolNames.add(part.toolName);
                sendApiEvent(controller, 'tool_call', {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                });
                break;
              case 'tool-result':
                sendApiEvent(controller, 'tool_result', {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                });
                break;
            }
          }

          // Fallback: use resolved text if fullMessage is empty (multi-step tool use)
          if (!fullMessage) {
            try {
              const resolvedText = (await streamResult.text) || '';
              if (resolvedText) {
                fullMessage = resolvedText;
              }
            } catch {
              // text promise may reject
            }
          }

          // Update Langfuse trace with output and tool tags
          if (usedToolNames.size > 0) {
            for (const toolName of usedToolNames) {
              traceTags.push(`tool:${toolName}`);
            }
          }
          updateActiveTrace({
            output: fullMessage,
            tags: traceTags,
          });

          // Close MCP clients after streaming completes
          if (closeMcpClients) {
            closeMcpClients().catch((err) =>
              logger.error({ err }, 'Error closing MCP clients'),
            );
          }

          sendApiEvent(controller, 'llm_completed');

          // Track AI usage (fire-and-forget)
          try {
            const usage = await streamResult.usage;
            const modelId = effectiveSettings.model || '';
            const provider =
              getModelProvider(normalizeModelId(modelId)) || 'openrouter';

            trackAiUsage({
              organizationId: orgId,
              projectId: threadRecord.project_id ?? null,
              threadId: threadRecord.public_id,
              userId,
              step: AiUsageStep.CHAT_COMPLETION,
              provider,
              model: modelId,
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              totalTokens: usage.totalTokens ?? 0,
            });
          } catch (usageError) {
            logger.error({ err: usageError }, 'Failed to track AI usage');
          }

          sendApiEvent(controller, 'save_assistant_response');

          try {
            const dbMessage = await createMessageInDB({
              threadId: threadRecord.id,
              message: {
                id: threadMessage.public_id,
                content: fullMessage,
                source: Source.UI,
              },
              role: Role.ASSISTANT,
              runId: '',
              messageType: threadRecord.preferred_communication_type,
            });

            sendApiEvent(controller, 'assistant_response_saved');

            try {
              // We create an object without the full content because it has already been sent in the delta events
              const messageToSend: ApiSseMessageEvent = {
                id: dbMessage.public_id,
                role: dbMessage.role,
                created_at: dbMessage.created_at.toISOString(),
                content: '', // We clear the content - the client already has the full message from the delta events
                run_id: '',
              };

              sendApiEvent(controller, 'final_response', messageToSend);

              // close stream
              sendApiEvent(controller, 'close');

              controller.close();
            } catch (finalResponseError) {
              logger.error(
                { err: finalResponseError },
                'Error sending final_response after assistant_response_saved',
              );

              try {
                sendApiEvent(controller, 'close');
                controller.close();
              } catch (closeError) {
                logger.error(
                  { err: closeError },
                  'Error closing stream after final_response error',
                );
              }
            }
          } catch (finalResponseError) {
            logger.error(
              { err: finalResponseError },
              'Error sending final_response after assistant_response_saved',
            );
          }
        } catch (error) {
          const exceptionFilter = new SseExceptionFilter();
          logger.error({ err: error }, 'Error processing SSE');
          // this also sends error event which can be handled in UI
          exceptionFilter.handleError(error, controller);

          // Ensure MCP clients are closed on error
          if (closeMcpClients) {
            closeMcpClients().catch((err) =>
              logger.error(
                { err },
                'Error closing MCP clients during error handling',
              ),
            );
          }

          try {
            controller.close();
          } catch (closeError) {
            logger.error({ err: closeError }, 'Error closing controller');
          }
        }
      },
      { name: 'streamEvents' },
    ),
  });
}
