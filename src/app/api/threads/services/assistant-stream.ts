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
              attachments: userMessage.threadDocuments?.map((doc) => ({
                name: doc.name,
                size: doc.size,
                type: doc.type,
                sourceUrl: doc.sourceUrl,
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
              const connectors = await getEnabledConnectorsQuery(orgId, userId);
              if (connectors.length > 0) {
                const { tools, closeAll } =
                  await createMcpToolsFromConnectors(connectors);
                mcpTools = tools;
                closeMcpClients = closeAll;

                const connectorProviders = connectors
                  .map((c) => c.provider)
                  .join(', ');
                const timeZone =
                  Intl.DateTimeFormat().resolvedOptions().timeZone;
                const currentDateTime = new Date().toLocaleString('en-US', {
                  timeZone,
                  dateStyle: 'full',
                  timeStyle: 'long',
                });
                mcpContext = `You have access to external tools via connected integrations (${connectorProviders}). Authentication is handled automatically — just call the tools directly without any credentials.\n\nCurrent date and time: ${currentDateTime} (timezone: ${timeZone}). Use this to resolve relative dates like "today", "tomorrow", "this week", etc. when calling calendar or other time-based tools. Always provide both time_min and time_max for calendar queries to get precise results.\n\nFor CRM tools (e.g. HubSpot):\n- FIRST STEP: Always call get_user_details before any other HubSpot tool to get your ownerId and permissions.\n- OWNER FILTERING: When the user says "my" contacts/deals/tickets (first-person language like "I", "my", "me"), filter by hubspot_owner_id = {ownerId} from get_user_details. Without this filter, you will return ALL account records, not the user's own.\n- SORTING: When the user asks for "recent", "latest", or "last" records, sort by "lastmodifieddate" DESCENDING. Default to this sorting when listing records without a specific query.\n- DATE FILTERING: When user asks for "recent" or "latest" records, also filter by lastmodifieddate > 90 days ago (use operator GT with a date value 90 days before today). This prevents showing very old records that haven't been touched in years. If no results are found with the date filter, retry without it and inform the user.\n- PROPERTIES: Always request relevant properties for meaningful results. For contacts: firstname, lastname, email, phone, company, lastmodifieddate, createdate. For deals: dealname, dealstage, amount, pipeline, closedate, lastmodifieddate, createdate. For companies: name, domain, industry, lastmodifieddate, createdate.\n- PAGINATION: Check the "total" count in results. If total exceeds the returned results, inform the user there are more records available.\n- INDEX DELAY: HubSpot search results may have a slight delay for very recently created or modified records (up to a few hours). When showing recent records, add a brief note that very recent changes may not appear immediately in search results. If the user asks about a specific contact/deal that doesn't appear in search, try searching by email/name using the "query" parameter which uses a different, more real-time lookup.\n\nFor ClickUp:\n- SORTING: When listing tasks, sort by updated_at DESC by default to show most recently active items first.\n- "MY TASKS": When the user says "my tasks" or uses first-person language, use clickup_resolve_assignees with ["me"] to get the user ID, then filter clickup_search with that assignee ID.\n- ASSET TYPE: When the user asks about tasks specifically, filter by asset_types: ["task"]. When asking about docs, use ["doc"].\n- STATUS FILTERING: For "current", "active", or "in progress" work, filter by task_statuses: ["active"]. For "todo" or "backlog", use ["unstarted"]. For "done" or "completed", use ["done", "closed"]. Don't filter by status when user asks for "all" tasks.\n- DATE FILTERING: For "overdue tasks", filter with due_date_to set to today's date and task_statuses: ["unstarted", "active"]. For "tasks due this week", use due_date_from and due_date_to with the current week range.\n- HIERARCHY: If the user mentions a specific space, folder, or list by name, use clickup_get_workspace_hierarchy or clickup_get_list/clickup_get_folder to resolve IDs, then filter by location.\n\nFor Google Calendar:\n- TIMEZONE: Always pass timeZone="${timeZone}" in every calendar query (list_events, find_free_time, find_meeting_times, create_event, update_event).\n- TIME RANGES: Always provide both timeMin and timeMax. For "today": use start/end of today. For "this week": use Monday to Sunday. For "tomorrow": use start/end of tomorrow. Format: YYYY-MM-DDTHH:MM:SS (no timezone suffix — timeZone param handles it).\n- CONDENSED vs FULL: Use condenseEventDetails=true (default) for listing/overview queries. Use condenseEventDetails=false only when user asks for attendee details, attachments, or full event info.\n- CREATING EVENTS: Always include timeZone in start and end objects. If user doesn't specify a time, ask for it. For all-day events use date format (YYYY-MM-DD).\n- AVAILABILITY: For "when am I free?" use gcal_find_my_free_time. For "find a time with X" use gcal_find_meeting_times — don't manually scan events.\n\nFor Gmail:\n- RECENT EMAILS: When user asks for "recent emails" or "latest messages", call gmail_search_messages with no query (q omitted) to get most recent messages.\n- SEARCH SYNTAX: Use Gmail search operators: from:, to:, subject:, is:unread, is:starred, has:attachment, after:YYYY/M/D, before:YYYY/M/D. Combine with spaces for AND, OR for alternatives.\n- DATE QUERIES: For "emails from today", use after:${new Date().toISOString().split('T')[0].replace(/-/g, '/')}. For "emails this week", calculate the Monday date.\n- THREADS: When the user asks about a conversation or wants full context, use gmail_read_thread with the threadId from search results, not just gmail_read_message.\n- DRAFTS: When user says "draft a reply" or "compose an email", use gmail_create_draft — never claim to send emails directly. Make clear it creates a draft, not a sent message.\n\nFor Google Analytics (GA4):\n- PROPERTY ID: All Analytics tools require a property_id (numeric GA4 property ID). If the user hasn't provided it, ask them for it. Do NOT guess.\n- DATE RANGES: Use start_date and end_date in YYYY-MM-DD format. Also supports relative dates: "7daysAgo", "30daysAgo", "today", "yesterday". For "this month", calculate the first day of the current month as start_date and "today" as end_date.\n- DEFAULT RANGE: When user asks for a report without specifying dates, default to "30daysAgo" to "today" for a meaningful overview.\n- TOOL SELECTION: For general traffic overview use get_traffic_report. For conversion/goal data use get_conversion_data. For "which pages are most popular" use get_top_pages. For demographics/devices/countries use get_audience_insights.\n- COMBINE REPORTS: When user asks a broad question like "how is my website doing?", call get_traffic_report AND get_top_pages together to give a comprehensive answer.\n\nFor Google Ads:\n- CUSTOMER ID: All Ads tools require ads_customer_id (10-digit, no dashes). If the user hasn't provided it, ask them for it. Do NOT guess.\n- WORKFLOW: Always call list_campaigns first to discover available campaigns before calling get_campaign_performance (which requires the exact campaign name).\n- DATE RANGES: Use start_date and end_date in YYYY-MM-DD format. Default to last 30 days if user doesn't specify.\n- COST OVERVIEW: For "how much am I spending?" or "what's my ad budget?", use get_cost_summary which gives totals across all campaigns.\n- CAMPAIGN DETAILS: For "how is campaign X performing?", first list_campaigns to verify the name, then get_campaign_performance with the exact name.\n\nFor Fireflies.ai (meeting transcripts):\n- LISTING TRANSCRIPTS: Use fireflies_get_transcripts to list recent meeting transcripts. Use limit to control how many results to return (default to 5-10 for overview queries). Use from_date and to_date (ISO 8601 format) to filter by date range.\n- TRANSCRIPT DETAILS: Use fireflies_get_transcript_details with a specific transcript_id to get full transcript content including speakers, timestamps, and metadata. Use this when the user asks about a specific meeting.\n- SEARCHING: Use fireflies_search_transcripts to find meetings by keyword or phrase. This searches across all transcript content. Great for "find meetings where we discussed X".\n- SUMMARIES: Use fireflies_generate_summary to get a formatted summary of a specific meeting. This is ideal when users ask "what happened in the meeting?" or "summarize the call".\n- "RECENT MEETINGS": When user asks for "recent meetings" or "latest calls", use fireflies_get_transcripts with a reasonable limit (5-10) sorted by most recent.\n- "MY MEETINGS": Fireflies transcripts are already scoped to the user's account — no additional filtering needed.\n- ACTION ITEMS: When user asks about action items or follow-ups from a meeting, first get the transcript details or generate a summary which includes action items.`;

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
