import { Role, Source } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import {
  getThreadMessages,
  getThreadDetails,
} from '../../../lib/services/thread';
import {
  createAndStoreMessage,
  createMessageInDB,
} from '../../../lib/services/message';
import { ApiSseMessageEvent } from '../../../contracts/Events';
import { logger } from '../../../lib/utils/logger';
import { initializeRagChain } from './initializeBasicRag';
import { initializeConversationChain } from '../services/initializeConversationChain';
import { getAllSettings } from '@/app/lib/services/settings';
import { ApiKeyError } from '@/libs/chains/errors';
import { SseExceptionFilter } from '../services/sseExceptionFilter';
import { setSentryContext } from '@/app/lib/services/sentry';
import { Runnable } from '@langchain/core/runnables';
import { ChatType, CreateMessageDto } from '@/app/contracts/Message';
import { sendApiEvent } from '@/libs/sse/prepare-sse-message';
import { initializePublicRagChain } from '../../guest-threads/[...guestDetails]/services/initializePublicBasicRag';
import { AssistantMode } from '@/app/contracts/Assistant';
import { getProjectInstruction } from '@/app/lib/services/projectInstructions';
import { ThreadDocumentUI } from '@/app/contracts/ThreadDocument';

/**
 * Load thread documents from database for a specific thread
 */
async function loadThreadDocuments(
  threadId: string
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
      'loadThreadDocuments: Retrieved thread documents from database'
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
      'loadThreadDocuments: Error loading thread documents from database'
    );
    return [];
  }
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

      let runId: string = '';

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
        let effectiveProjectId: number | null = null;

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
                  mentionedProject.public_id
                );
                effectiveProjectId = mentionedProject.id;

                logger.info(
                  {
                    mentionedProjectId: threadRecord.mentioned_project_id,
                    mentionedProjectPublicId: mentionedProject.public_id,
                    hasInstruction: Boolean(projectInstruction),
                  },
                  'Using instructions from mentioned project (highest priority)'
                );
              } catch (error) {
                logger.error(
                  {
                    err: error,
                    mentionedProjectId: threadRecord.mentioned_project_id,
                    mentionedProjectPublicId: mentionedProject.public_id,
                  },
                  'Error getting instructions from mentioned project, falling back to thread project'
                );
                // Continue to fallback logic below
              }
            } else {
              logger.warn(
                { mentionedProjectId: threadRecord.mentioned_project_id },
                'Mentioned project not found, falling back to thread project'
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
                threadRecord.project.public_id
              );
              effectiveProjectId = threadRecord.project.id;

              logger.info(
                {
                  internalProjectId: threadRecord.project_id,
                  publicProjectId: threadRecord.project.public_id,
                  hasInstruction: Boolean(projectInstruction),
                },
                'Using instructions from thread project (medium priority)'
              );
            } catch (error) {
              logger.error(
                {
                  err: error,
                  projectId: threadRecord.project_id,
                  publicProjectId: threadRecord.project?.public_id,
                },
                'Error getting instructions from thread project, will use organization instructions'
              );
              // Will fallback to organization instructions via effectiveSettings.prompt
            }
          } else if (!projectInstruction && threadRecord.project_id) {
            logger.warn(
              { projectId: threadRecord.project_id },
              'Project associated with thread, but missing public_id'
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
              'No project instructions found, will use organization instructions (lowest priority fallback)'
            );
          }
        } catch (error) {
          logger.error(
            { err: error },
            'Error in project instruction resolution, using organization fallback'
          );
          // projectInstruction stays null, chains will use organization instructions
        }

        let chain: Runnable | undefined = undefined;
        let finalAnswerRunName: string | undefined = undefined;

        //TODO: stream chain errors
        // Initialize the appropriate chain based on mode
        if (mode === AssistantMode.INTERNAL) {
          if (filteredMode === ChatType.CONVERSATION) {
            const conversation = await initializeConversationChain({
              settings: {
                ...effectiveSettings,
                apiKey: effectiveSettings.apiKey,
              },
              projectInstruction,
            });
            chain = conversation.chain;
            finalAnswerRunName = conversation.finalAnswerRunName;
          } else {
            // Use effective project ID (mentioned project takes priority over thread project)
            const projectIdToUse =
              effectiveProjectId || threadRecord.project?.id;
            if (!projectIdToUse) {
              logger.error(
                {
                  threadId: publicThreadId,
                  effectiveProjectId,
                  threadProjectId: threadRecord.project?.id,
                  mentionedProjectId: threadRecord.mentioned_project_id,
                },
                'No project ID available for RAG chain initialization'
              );
              throw new Error(
                'Project ID is required for knowledge base access'
              );
            }

            const threadDocuments = await loadThreadDocuments(threadRecord.id);

            const basicRag = await initializeRagChain({
              settings: {
                ...effectiveSettings,
                apiKey: effectiveSettings.apiKey,
              },
              projectInstruction,
              internalProjectId: projectIdToUse,
              threadDocuments,
            });
            chain = basicRag.chain;
            finalAnswerRunName = basicRag.finalAnswerRunName;
          }
        } else if (mode === AssistantMode.PUBLIC) {
          const projectIdToUse = effectiveProjectId || threadRecord.project?.id;
          const publicRag = await initializePublicRagChain({
            settings: {
              ...effectiveSettings,
              apiKey: effectiveSettings.apiKey,
            },
            organizationId: orgId,
            projectInstruction,
            projectId: projectIdToUse,
          });
          chain = publicRag.chain;
          finalAnswerRunName = publicRag.finalAnswerRunName;
        }

        if (!chain) {
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

        const eventStream = chain.streamEvents(
          {
            question: threadMessage.content,
            chat_history: conv_history,
          },
          {
            version: 'v2',
          }
        );

        setSentryContext('EXTRA_DATA', {
          userQuestion: threadMessage.content,
          publicThreadId,
          publicMessageId: threadMessage.public_id,
        });

        let fullMessage = '';
        let chainRunIds = [];

        for await (const event of eventStream) {
          // TODO: stream selected chain events
          // e. g. related to start and end of vector store  retrieval
          // sendApiEvent(controller, event.event, {
          //   name: event.name,
          // });

          if (event.event === 'on_chain_start') {
            chainRunIds.push(event.run_id);
            runId = chainRunIds[0];
          }

          if (
            event.event === 'on_parser_stream' &&
            event.name === finalAnswerRunName
          ) {
            const textChunk = event.data.chunk || '';
            fullMessage += textChunk;

            sendApiEvent(controller, 'delta', {
              content: textChunk,
            });
          } else if (
            event.event === 'on_parser_end' &&
            event.name === finalAnswerRunName
          ) {
            sendApiEvent(controller, 'llm_completed');

            sendApiEvent(controller, 'save_assistant_response');

            try {
              const dbMessage = await createMessageInDB({
                threadId: threadRecord.id,
                message: {
                  id: threadMessage.public_id,
                  content: event.data.output,
                  source: Source.UI,
                },
                role: Role.ASSISTANT,
                runId,
                messageType: threadRecord.preferred_communication_type,
              });

              sendApiEvent(controller, 'assistant_response_saved');

              try {
                // We create an object without the full content because it has already been sent in the delta events

                const messageToSend: ApiSseMessageEvent = {
                  id: dbMessage.public_id,
                  role: dbMessage.role,
                  created_at: dbMessage.created_at.toISOString(),
                  content: '', // We clear the content – the client already has the full message from the delta events
                  run_id: runId,
                };

                sendApiEvent(controller, 'final_response', messageToSend);

                // close stream
                sendApiEvent(controller, 'close');

                controller.close();
              } catch (finalResponseError) {
                logger.error(
                  { err: finalResponseError },
                  'Error sending final_response after assistant_response_saved'
                );

                try {
                  sendApiEvent(controller, 'close');
                  controller.close();
                } catch (closeError) {
                  logger.error(
                    { err: closeError },
                    'Error closing stream after final_response error'
                  );
                }
              }
            } catch (finalResponseError) {
              logger.error(
                { err: finalResponseError },
                'Error sending final_response after assistant_response_saved'
              );
            }
          }
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
