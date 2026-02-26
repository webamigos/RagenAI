import { Role, Source, AiUsageStep } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import {
  getThreadMessagesListQuery as getThreadMessages,
  getThreadDetailsQuery as getThreadDetails,
} from '@/features/threads/services/queries/get-thread-details-query';
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

export async function streamEvents({
  publicThreadId,
  userMessage,
  orgId,
  mode,
  filteredMode,
  visitorId,
}: Config) {
  return new ReadableStream({
    async start(controller) {
      sendApiEvent(controller, 'init');

      try {
        const rawSettings = await getAllSettings(orgId);
        if (!rawSettings.apiKey) {
          throw new ApiKeyError();
        }

        // TODO: to optimize we can move database queries after chain run
        sendApiEvent(controller, 'find_thread');

        const threadRecord = await getThreadDetails(publicThreadId);

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

        // TODO: handle moderated message
        // save message
        sendApiEvent(controller, 'save_user_message');

        const threadMessage = await createAndStoreMessage({
          threadId: threadRecord.id,
          prompt: userMessage.prompt,
          visitorId, // only for public threads
          messageType: userMessage.messageType,
          voiceDurationSeconds: userMessage.voiceDurationSeconds,
        });

        if (!threadMessage) {
          logger.error('Thread message not found');
          controller.close();
          return;
        }

        sendApiEvent(controller, 'user_message_saved', {
          id: threadMessage.public_id,
        });

        // Send event with created message ID
        sendApiEvent(controller, 'user_message_created', {
          id: threadMessage.public_id,
        });

        // Determine project instructions with fallback hierarchy
        // Priority: mentioned_project_id > project_id > organization instructions (from effectiveSettings.prompt)
        let projectInstruction: string | null = null;
        let effectiveProjectPublicId: string | null = null;

        try {
          sendApiEvent(controller, 'init_lmm');

          // 1. HIGHEST PRIORITY: Mentioned project (via @ mention)
          if (threadRecord.mentioned_project_id) {
            const mentionedProject = await db.project.findUnique({
              where: { id: threadRecord.mentioned_project_id },
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
                // Continue to fallback logic below
              }
            } else {
              logger.warn(
                { mentionedProjectId: threadRecord.mentioned_project_id },
                'Mentioned project not found, falling back to thread project',
              );
              // Continue to fallback logic below
            }
          }

          // 2. MEDIUM PRIORITY: Thread project (if no mentioned project or mentioned project failed)
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
              // Will fallback to organization instructions via effectiveSettings.prompt
            }
          } else if (!projectInstruction && threadRecord.project_id) {
            logger.warn(
              { projectId: threadRecord.project_id },
              'Project associated with thread, but missing public_id',
            );
          }

          // 3. LOWEST PRIORITY: Organization instructions
          // This fallback is automatically handled by effectiveSettings.prompt in the chain initialization
          // No additional code needed - if projectInstruction is null, chains use organization instructions
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
          // projectInstruction stays null, chains will use organization instructions
        }

        let chainOutput: BaseChatChainOutput | undefined = undefined;

        //TODO: stream chain errors
        // Initialize the appropriate chain based on mode
        if (mode === AssistantMode.INTERNAL) {
          if (filteredMode === ChatType.CONVERSATION) {
            chainOutput = await initializeConversationChain({
              settings: {
                ...effectiveSettings,
                apiKey: effectiveSettings.apiKey,
              },
              projectInstruction,
            });
          } else {
            // Use effective project ID (mentioned project takes priority over thread project)
            const projectIdToUse =
              threadRecord.mentioned_project_id || threadRecord.project_id;
            const projectPublicIdToUse =
              effectiveProjectPublicId || threadRecord.project?.public_id;

            // Load thread documents from DB and merge with inline documents from the request.
            // Inline documents (from request body) have content immediately available,
            // while DB documents may have empty content if async processing hasn't completed yet.
            const dbThreadDocuments = await loadThreadDocuments(
              threadRecord.id,
            );
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
              projectInstruction,
              projectId: projectIdToUse ?? null,
              projectPublicId: projectPublicIdToUse ?? null,
              threadDocuments,
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
          // TODO: invalid chain error
          sendApiEvent(controller, 'close');

          controller.close();
          return;
        }

        // TODO: to optimize db queries we can pass messages from client instead of fetching from db?
        sendApiEvent(controller, 'get_thread_messages');
        const threadMessages = await getThreadMessages(publicThreadId);

        sendApiEvent(controller, 'add_thread_messages_to_lmm');

        const conv_history = threadMessages?.messages
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join('\n');

        sendApiEvent(controller, 'start_lmm');

        const streamResult = await chainOutput.stream({
          question: threadMessage.content,
          chat_history: conv_history,
        });

        let fullMessage = '';

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
          }
        }

        sendApiEvent(controller, 'llm_completed');

        // Track AI usage (fire-and-forget)
        try {
          const usage = await streamResult.usage;
          const modelId = effectiveSettings.model || '';
          const provider =
            getModelProvider(normalizeModelId(modelId)) || 'openrouter';
          const userId = await getCurrentUserId().catch(() => null);

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

        try {
          controller.close();
        } catch (closeError) {
          logger.error({ err: closeError }, 'Error closing controller');
        }
      }
    },
  });
}
