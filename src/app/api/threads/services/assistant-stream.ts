import { Role, Source, AiUsageStep } from '@/generated/prisma/client';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
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
import {
  getAllSettings,
  getPublicChatModel,
} from '@/features/organizations/services/organization-settings';
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
import { getTemplateInstructionForProject } from '@/features/assistant-templates/services/queries/get-template-instruction-query';
import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import type { BaseChatChainOutput } from '@/libs/chains/types/common';
import { getCurrentUserId } from '@/app/lib/utils/auth-helpers';
import { getModelProvider, normalizeModelId } from '@/app/components/config';
import { getEnabledConnectorsQuery } from '@/features/connectors/services/queries/get-enabled-connectors-query';
import { createMcpToolsFromConnectors } from '@/libs/mcp/client';
import { buildMcpContext } from '@/libs/mcp/provider-instructions';
import { getProjectMcpProvidersQuery } from '@/features/projects/services/queries/get-project-mcp-providers-query';
import { getAvailableConnectorProvidersForOrg } from '@/features/connectors/services/queries/get-available-connectors-query';
import { observe, updateActiveTrace } from '@langfuse/tracing';
import { getLiteLLMOrgApiKey } from '@/features/organizations/services/organization-settings';
import { getSession, getUserTeamIds, getActiveMember } from '@/lib/auth-guards';
import { isOrgAdmin as checkOrgAdmin } from '@/lib/auth-access-control';
import { createBuiltInTools, getBuiltInToolsContext } from '@/libs/tools';
import { isEncryptionEnabled } from '@/libs/crypto/thread-encryption';
import { recordSecurityEvent } from '@/features/security/services/commands/record-security-event-command';
import {
  classifyJailbreakRisk,
  isAboveJailbreakThreshold,
} from '@/libs/security/jailbreak-classifier';
import { StreamUnmasker } from '@/libs/pii/stream-unmasker';
import { anonymizeWithSecurityEvents } from '@/libs/pii/anonymize-with-security-events';
import { applyPiiUnmaskToTools } from '@/libs/mcp/client';

/**
 * Load thread documents from database for a specific thread
 */
async function loadThreadDocuments(
  threadId: string,
): Promise<ThreadDocumentUI[]> {
  try {
    const threadDocuments = await db.threadDocument.findMany({
      where: { threadId: threadId },
      include: {
        userFile: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            fileMimeType: true,
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
        userFileIds: threadDocuments.map((td) => td.userFile.id),
        fileNames: threadDocuments.map((td) => td.userFile.fileName),
      },
      'loadThreadDocuments: Retrieved thread documents from database',
    );

    const threadDocumentsUI: ThreadDocumentUI[] = threadDocuments.map((td) => ({
      name: td.userFile.fileName,
      content: td.userFile.document?.content || '',
      size: td.userFile.fileSize,
      type: td.userFile.fileMimeType || 'application/octet-stream',
      userFileId: td.userFile.id,
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
  projectId?: string;
};

type ThreadRecord = Awaited<ReturnType<typeof getThreadDetails>>;

async function resolveProjectInstruction(
  threadRecord: ThreadRecord,
  orgId: string,
  rawSettings: { model: string },
  effectiveSettings: { prompt: string; model: string },
): Promise<{ instruction: string | null; projectId: string | null }> {
  let projectInstruction: string | null = null;
  let effectiveProjectId: string | null = null;

  try {
    // 1. HIGHEST PRIORITY: Mentioned project (via @ mention)
    if (threadRecord.mentionedProjectId) {
      const mentionedProject = await db.project.findFirst({
        where: {
          id: threadRecord.mentionedProjectId,
          organizationId: orgId,
        },
        select: { id: true, title: true },
      });

      if (mentionedProject) {
        try {
          projectInstruction = await getProjectInstruction(mentionedProject.id);
          effectiveProjectId = mentionedProject.id;

          logger.info(
            {
              mentionedProjectId: threadRecord.mentionedProjectId,
              hasInstruction: Boolean(projectInstruction),
            },
            'Using instructions from mentioned project (highest priority)',
          );
        } catch (error) {
          logger.error(
            {
              err: error,
              mentionedProjectId: threadRecord.mentionedProjectId,
            },
            'Error getting instructions from mentioned project, falling back to thread project',
          );
        }
      } else {
        logger.warn(
          { mentionedProjectId: threadRecord.mentionedProjectId },
          'Mentioned project not found, falling back to thread project',
        );
      }
    }

    // 2. MEDIUM PRIORITY: Thread project
    if (
      !projectInstruction &&
      threadRecord.projectId &&
      threadRecord.project?.id
    ) {
      try {
        projectInstruction = await getProjectInstruction(
          threadRecord.project.id,
        );
        effectiveProjectId = threadRecord.project.id;
      } catch {
        // Auth-based query failed (e.g. public/guest thread) — query directly with orgId
        try {
          const project = await db.project.findFirst({
            where: { id: threadRecord.project.id, organizationId: orgId },
            select: { id: true },
          });
          if (project) {
            const settings = await db.projectSettings.findUnique({
              where: { projectId: project.id },
              select: { instructions: true },
            });
            projectInstruction = settings?.instructions ?? null;
            effectiveProjectId = project.id;
          }
        } catch (fallbackError) {
          logger.error(
            { err: fallbackError, projectId: threadRecord.projectId },
            'Error getting instructions from thread project via fallback',
          );
        }
      }

      // Fallback: check linked assistant template instructions
      if (!projectInstruction && threadRecord.projectId) {
        try {
          const templateInstruction = await getTemplateInstructionForProject(
            threadRecord.projectId,
          );
          if (templateInstruction) {
            projectInstruction = templateInstruction;
            effectiveProjectId = effectiveProjectId || threadRecord.project.id;
            logger.info(
              { projectId: threadRecord.projectId },
              'Using instructions from linked assistant template',
            );
          }
        } catch {
          // Template lookup failed — continue without
        }
      }

      logger.info(
        {
          projectId: threadRecord.projectId,
          hasInstruction: Boolean(projectInstruction),
        },
        'Using instructions from thread project (medium priority)',
      );
    }

    // 3. LOWEST PRIORITY: Organization instructions (handled by chain initialization)
    if (!projectInstruction) {
      logger.info(
        {
          orgId,
          hasOrgPrompt: Boolean(effectiveSettings.prompt),
          effectiveModel: effectiveSettings.model,
          threadModel: threadRecord.preferredModel,
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
    projectId: effectiveProjectId,
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

          const [rawSettings, threadRecord, litellmApiKey] = await Promise.all([
            getAllSettings(orgId),
            getThreadDetails(publicThreadId, orgId, {
              includeMessages: true,
            }),
            getLiteLLMOrgApiKey(orgId),
          ]);

          if (!rawSettings.apiKey) {
            throw new ApiKeyError();
          }

          sendApiEvent(controller, 'thread_found', {
            id: threadRecord.id,
          });

          // For public mode, use the org's dedicated public chat model if configured
          let effectiveModel = threadRecord.preferredModel || rawSettings.model;
          if (mode === AssistantMode.PUBLIC) {
            const publicModel = await getPublicChatModel(orgId);
            if (publicModel) {
              effectiveModel = publicModel;
            }
          }

          const effectiveSettings = {
            apiKey: rawSettings.apiKey,
            model: effectiveModel,
            temperature: rawSettings.temperature,
            prompt: rawSettings.prompt,
            maxDocumentsToRetrieve: rawSettings.maxDocumentsToRetrieve,
            voiceId: rawSettings.voiceId,
            litellmApiKey: litellmApiKey ?? undefined,
          };

          const piiSystemInstruction =
            'Niektóre dane wrażliwe w wiadomości użytkownika zostały zastąpione placeholderami w formacie <ENTITY_N>, np. <PL_NIP_1>, <PL_PESEL_1>, <PL_REGON_1>, <PL_IBAN_1>, <PL_ID_CARD_1>, <PL_PHONE_1>, <EMAIL_ADDRESS_1>, <CREDIT_CARD_1>. Gdy używasz tych tokenów w odpowiedzi lub argumentach narzędzi, przepisuj je dokładnie bez żadnych zmian — nie parafrazuj, nie opisuj słownie, nie zastępuj innym tekstem.';

          const effectivePromptWithPii = effectiveSettings.prompt
            ? `${effectiveSettings.prompt}\n\n${piiSystemInstruction}`
            : piiSystemInstruction;

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
              projectId: string | null;
            }>,
            Promise<ThreadDocumentUI[]>,
          ] = [
            createAndStoreMessage({
              threadId: threadRecord.id,
              prompt: userMessage.prompt,
              visitorId,
              messageType: userMessage.messageType,
              voiceDurationSeconds: userMessage.voiceDurationSeconds,
              attachments: userMessage.threadDocuments?.map((doc) => ({
                name: doc.name,
                size: doc.size,
                type: doc.type,
                sourceUrl: doc.sourceUrl,
                imageData: doc.imageData,
              })),
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
              let connectors = await getEnabledConnectorsQuery(orgId, userId);

              // Org-level filtering: only keep connectors allowed by app + org settings
              const orgAllowedProviders =
                await getAvailableConnectorProvidersForOrg(orgId);
              connectors = connectors.filter((c) =>
                orgAllowedProviders.includes(c.provider),
              );

              const effectiveProjectId = projectResult.projectId;
              if (effectiveProjectId && connectors.length > 0) {
                const projectMcpProviders =
                  await getProjectMcpProvidersQuery(effectiveProjectId);
                connectors = connectors.filter((c) =>
                  projectMcpProviders.includes(c.provider),
                );
              }

              if (connectors.length > 0) {
                const { tools, loadedProviders, closeAll } =
                  await createMcpToolsFromConnectors(connectors);
                mcpTools = tools;
                closeMcpClients = closeAll;

                const connectorProviders = loadedProviders;
                const timeZone =
                  Intl.DateTimeFormat().resolvedOptions().timeZone;
                const currentDateTime = new Date().toLocaleString('en-US', {
                  timeZone,
                  dateStyle: 'full',
                  timeStyle: 'long',
                });
                mcpContext = buildMcpContext(
                  connectorProviders,
                  timeZone,
                  currentDateTime,
                );

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

          // Load built-in tools for authenticated internal users
          // Gated behind FEATURE_FLAG_BUILT_IN_TOOLS (disabled by default — document generation tool needs more work)
          if (
            process.env.FEATURE_FLAG_BUILT_IN_TOOLS === '1' &&
            userId &&
            mode === AssistantMode.INTERNAL
          ) {
            try {
              const session = await getSession();
              const userEmail = session?.user?.email || '';
              const builtInTools = createBuiltInTools({
                orgId,
                userId,
                userEmail,
              });
              mcpTools = { ...mcpTools, ...builtInTools };

              const builtInContext = getBuiltInToolsContext();
              mcpContext = mcpContext
                ? `${mcpContext}\n\n${builtInContext}`
                : builtInContext;
            } catch (error) {
              logger.error(
                { err: error },
                'Failed to load built-in tools, continuing without them',
              );
            }
          }

          sendApiEvent(controller, 'user_message_saved', {
            id: threadMessage.id,
          });

          sendApiEvent(controller, 'user_message_created', {
            id: threadMessage.id,
          });

          const {
            instruction: projectInstruction,
            projectId: effectiveProjectId,
          } = projectResult;

          // Phase 3: Usage limits are now enforced by LiteLLM budget on the team's virtual key.
          // LiteLLM returns a 400 error when budget is exceeded, which is caught in the
          // error handler below and translated to a user-friendly message.

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
          const skipLangfuseContent = isEncryptionEnabled();
          updateActiveTrace({
            name: `chat-${(() => {
              if (mode === AssistantMode.PUBLIC) {
                return 'public';
              }
              if (filteredMode === ChatType.CONVERSATION) {
                return 'conversation';
              }
              return 'rag';
            })()}`,
            // input is set after PII masking in updateActiveTrace to avoid leaking raw PII to Langfuse
            userId: userId ?? undefined,
            sessionId: `${orgId}:${threadRecord.id}`,
            tags: traceTags,
          });

          // Phase 6 — fire-and-forget jailbreak classification. Must
          // NEVER delay the user's stream; we don't await this here.
          // On resolve: attach score to Langfuse trace, and if it
          // crosses the threshold, record a CHAT_JAILBREAK_DETECTED
          // event. The Phase 0.5 escalation rule (5 in 10 min from
          // same user) bumps severity to critical automatically.
          // Disabled unless JAILBREAK_DETECTION_ENABLED is truthy in
          // env — the classifier short-circuits to score=0 otherwise.
          // Jailbreak classification moved after PII masking — see below.

          if (mode === AssistantMode.INTERNAL) {
            if (filteredMode === ChatType.CONVERSATION) {
              const inlineThreadDocuments = userMessage.threadDocuments || [];
              const conversationThreadDocuments = mergeThreadDocuments(
                dbThreadDocuments,
                inlineThreadDocuments,
              );

              chainOutput = await initializeConversationChain({
                settings: {
                  ...effectiveSettings,
                  apiKey: effectiveSettings.apiKey,
                  prompt: effectivePromptWithPii,
                },
                orgId,
                projectInstruction,
                mcpTools,
                mcpContext,
                tracking: {
                  organizationId: orgId,
                  projectId: threadRecord.projectId,
                  userId,
                },
                threadDocuments: conversationThreadDocuments,
              });
            } else {
              const projectIdToUse =
                threadRecord.mentionedProjectId || threadRecord.projectId;

              const inlineThreadDocuments = userMessage.threadDocuments || [];
              const threadDocuments = mergeThreadDocuments(
                dbThreadDocuments,
                inlineThreadDocuments,
              );

              // Resolve user access context for RAG filtering
              let userTeamIds: string[] = [];
              let userIsOrgAdmin = false;
              if (userId) {
                const [teamIds, member] = await Promise.all([
                  getUserTeamIds(orgId, userId),
                  getActiveMember(orgId).catch(() => null),
                ]);
                userTeamIds = teamIds;
                userIsOrgAdmin = member ? checkOrgAdmin(member.role) : false;
              }

              chainOutput = await initializeRagChain({
                settings: {
                  ...effectiveSettings,
                  apiKey: effectiveSettings.apiKey,
                  prompt: effectivePromptWithPii,
                },
                orgId,
                userId,
                userTeamIds,
                isOrgAdmin: userIsOrgAdmin,
                projectInstruction,
                projectId: projectIdToUse ?? null,
                threadDocuments,
                mcpTools,
                mcpContext,
                approvedToolCalls: userMessage.approvedToolCalls,
              });

              // Phase 2b — record user approval/denial decisions. Both
              // are fire-and-forget audit events so admins see the
              // full decision trail in the security dashboard and the
              // escalation engine can detect abuse patterns (e.g. a
              // user approving 50 tool calls in 5 minutes).
              if (
                userMessage.approvedToolCalls &&
                userMessage.approvedToolCalls.length > 0
              ) {
                for (const approvedId of userMessage.approvedToolCalls) {
                  recordSecurityEvent({
                    eventType: 'TOOL_CALL_CONFIRMED',
                    severity: 'info',
                    source: 'chat',
                    organizationId: orgId ?? null,
                    userId: userId ?? null,
                    metadata: {
                      toolCallId: approvedId,
                      threadId: threadRecord.id,
                    },
                  });
                }
              }
              if (
                userMessage.deniedToolCalls &&
                userMessage.deniedToolCalls.length > 0
              ) {
                for (const deniedId of userMessage.deniedToolCalls) {
                  recordSecurityEvent({
                    eventType: 'TOOL_CALL_DENIED',
                    severity: 'info',
                    source: 'chat',
                    organizationId: orgId ?? null,
                    userId: userId ?? null,
                    metadata: {
                      toolCallId: deniedId,
                      threadId: threadRecord.id,
                    },
                  });
                }
              }
            }
          } else if (mode === AssistantMode.PUBLIC) {
            const projectIdToUsePublic =
              effectiveProjectId || threadRecord.project?.id;

            if (!projectIdToUsePublic) {
              logger.error(
                { threadId: threadRecord.id },
                'Public thread has no associated project — cannot query knowledge base',
              );
              sendApiEvent(controller, 'error', {
                type: 'error',
                message: 'Public thread must be associated with a project',
                code: 'unknown-error',
              });
              controller.close();
              return;
            }

            chainOutput = await initializePublicRagChain({
              settings: {
                ...effectiveSettings,
                apiKey: effectiveSettings.apiKey,
                prompt: effectivePromptWithPii,
              },
              organizationId: orgId,
              projectInstruction,
              projectId: projectIdToUsePublic,
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

          const {
            piiResult,
            entityTypes: piiAliasTypes,
            durationMs: piiMaskingDurationMs,
          } = await anonymizeWithSecurityEvents(userMessage.prompt, 'pl', {
            orgId: orgId ?? null,
            userId: userId ?? null,
            threadId: threadRecord.id,
          });
          logger.debug(
            {
              aliasCount: Object.keys(piiResult.aliasMap).length,
              aliasTypes: piiAliasTypes,
            },
            'PII masked prompt before LLM',
          );

          void classifyJailbreakRisk(piiResult.maskedText)
            .then((classification) => {
              if (classification.skipped) {
                return;
              }
              updateActiveTrace({
                metadata: {
                  jailbreakScore: classification.score,
                  ...(classification.reason
                    ? { jailbreakReason: classification.reason }
                    : {}),
                },
              });
              if (isAboveJailbreakThreshold(classification.score)) {
                recordSecurityEvent({
                  eventType: 'CHAT_JAILBREAK_DETECTED',
                  severity: 'info',
                  source: 'chat',
                  organizationId: orgId ?? null,
                  userId: userId ?? null,
                  metadata: {
                    score: classification.score,
                    threadId: threadRecord.id,
                    messageLength: piiResult.maskedText.length,
                    ...(classification.reason
                      ? { reason: classification.reason }
                      : {}),
                  },
                });
              }
            })
            .catch((err) => {
              logger.debug(
                { err },
                'Jailbreak classifier post-processing failed',
              );
            });

          applyPiiUnmaskToTools(mcpTools, piiResult.aliasMap);

          const streamResult = await chainOutput.stream({
            question: piiResult.maskedText,
            chat_history: conv_history,
          });

          let fullMessage = '';
          const usedToolNames = new Set<string>();
          const streamUnmasker = new StreamUnmasker(piiResult.aliasMap);

          for await (const part of streamResult.fullStream) {
            switch (part.type) {
              case 'text-delta': {
                const unmaskedDelta = streamUnmasker.process(part.textDelta);
                fullMessage += unmaskedDelta;
                sendApiEvent(controller, 'delta', {
                  content: unmaskedDelta,
                });
                break;
              }
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
                logger.info(
                  {
                    toolName: part.toolName,
                    toolCallId: part.toolCallId,
                    args: part.args,
                  },
                  'MCP tool call',
                );
                sendApiEvent(controller, 'tool_call', {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                });
                break;
              case 'tool-result':
                logger.info(
                  {
                    toolName: part.toolName,
                    toolCallId: part.toolCallId,
                    resultPreview: JSON.stringify(part.result).slice(0, 500),
                  },
                  'MCP tool result',
                );
                sendApiEvent(controller, 'tool_result', {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                });
                // NOTE: no local persistence of Rejestrio tool results
                // anymore. The MCP service owns the canonical enrichment
                // cache (company_profiles + financial_documents) and
                // exposes `search_enriched_leads` for aggregate queries.
                // When a real sales CRM layer lands, it'll get a
                // purpose-built `Lead` model referencing MCP data by
                // companyKrs — not a mirror of Rejestr.io fields.
                break;
              case 'tool-approval-request': {
                // Phase 2 prompt-injection gating: the SDK paused a write
                // tool because RAG context is present in this turn. The
                // tool has NOT executed. Surface the pause to the client
                // and record a security event so admins see repeated
                // blocks in the dashboard / daily digest.
                const provider = part.toolName.split('__')[0] ?? 'unknown';
                logger.warn(
                  {
                    approvalId: part.approvalId,
                    toolName: part.toolName,
                    toolCallId: part.toolCallId,
                    provider,
                  },
                  'MCP tool call blocked pending user confirmation',
                );
                sendApiEvent(controller, 'tool_approval_request', {
                  approvalId: part.approvalId,
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  provider,
                });
                // Synthesize an assistant-visible explanation so the
                // user sees WHY the turn stopped without waiting for
                // Phase 2b's modal. The message becomes part of the
                // persisted fullMessage below.
                const explanation = `\n\n_I wanted to call **${part.toolName}**, but this action has side effects and the current conversation includes content retrieved from your knowledge base. For your safety I'm not running it automatically — please reply with explicit intent (e.g. "yes, go ahead and ${part.toolName.split('__').pop()}") if you want me to proceed._`;
                fullMessage += explanation;
                sendApiEvent(controller, 'delta', { content: explanation });

                recordSecurityEvent({
                  eventType: 'TOOL_CALL_BLOCKED',
                  severity: 'info',
                  source: 'chat',
                  organizationId: orgId ?? null,
                  userId: userId ?? null,
                  metadata: {
                    toolName: part.toolName,
                    provider,
                    toolCallId: part.toolCallId,
                    approvalId: part.approvalId,
                    threadId: threadRecord.id,
                  },
                });
                break;
              }
            }
          }

          const flushedTail = streamUnmasker.flush();
          if (flushedTail) {
            fullMessage += flushedTail;
            sendApiEvent(controller, 'delta', { content: flushedTail });
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
          const piiEntityTypes = Object.keys(piiResult.aliasMap).map(
            (placeholder) =>
              placeholder
                .replace(/_\d+>$/, '>')
                .replace(/^</, '')
                .replace(/>$/, ''),
          );
          const uniquePiiEntityTypes = [...new Set(piiEntityTypes)];
          const hasPii = Object.keys(piiResult.aliasMap).length > 0;
          updateActiveTrace({
            ...(skipLangfuseContent
              ? {}
              : {
                  input: piiResult.maskedText,
                  // Omit when PII detected — fullMessage contains unmasked values restored for the user.
                  ...(!hasPii && { output: fullMessage }),
                }),
            tags: traceTags,
            metadata: {
              pii_entities_detected: uniquePiiEntityTypes,
              pii_count: Object.keys(piiResult.aliasMap).length,
              pii_masking_duration_ms: piiMaskingDurationMs,
            },
          });

          // Close MCP clients after streaming completes
          if (closeMcpClients) {
            closeMcpClients().catch((err) =>
              logger.error({ err }, 'Error closing MCP clients'),
            );
          }

          sendApiEvent(controller, 'llm_completed');

          try {
            const usage = await streamResult.usage;

            await trackAiUsage({
              organizationId: orgId,
              projectId: effectiveProjectId ?? null,
              threadId: publicThreadId,
              userId,
              step: AiUsageStep.CHAT_COMPLETION,
              provider: trackedProvider,
              model: trackedModelId,
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
                content: fullMessage,
                source: Source.UI,
              },
              role: Role.ASSISTANT,
              runId: '',
              messageType: threadRecord.preferredCommunicationType,
            });

            sendApiEvent(controller, 'assistant_response_saved');

            try {
              // We create an object without the full content because it has already been sent in the delta events
              const messageToSend: ApiSseMessageEvent = {
                id: dbMessage.id,
                role: dbMessage.role,
                createdAt: dbMessage.createdAt.toISOString(),
                content: '', // We clear the content - the client already has the full message from the delta events
                runId: '',
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
          // Translate LiteLLM budget exceeded errors to user-friendly message
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (
            errorMessage.includes('Budget has been exceeded') ||
            errorMessage.includes('ExceededBudget')
          ) {
            logger.warn(
              { err: error, orgId },
              'LiteLLM budget exceeded for organization',
            );
            const budgetError = new Error(
              'Monthly usage limit exceeded. Please contact your organization administrator.',
            );
            const exceptionFilter = new SseExceptionFilter();
            exceptionFilter.handleError(budgetError, controller);
          } else {
            const exceptionFilter = new SseExceptionFilter();
            logger.error({ err: error }, 'Error processing SSE');
            exceptionFilter.handleError(error, controller);
          }

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
