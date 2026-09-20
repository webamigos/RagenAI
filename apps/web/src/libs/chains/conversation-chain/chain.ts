import { streamText, stepCountIs } from 'ai';
import { buildToolApprovalConfig } from '@/libs/mcp/client';
import { getOrgGuardrailsQuery } from '@/features/guardrails/services/queries/get-org-guardrails-query';
import { runInputGuardrailsCommand } from '@/features/guardrails/services/commands/run-input-guardrails-command';
import type { ToolGatingContext } from '@/libs/security/tool-gating-context';
import {
  buildConversationMessages,
  validateAnswerGenerator,
} from './operations';
import type { ConversationChainParams } from '../types/conversation';
import { MAX_TOOL_STEPS } from '../types/common';
import type { BaseChatChainOutput } from '../types/common';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import { sanitizeAndValidateInput } from '../utils/common-operations';
import { partitionThreadDocuments } from '../utils/chain-utils';
import { mapFullStream } from '../utils/stream-mapper';

function formatThreadDocuments(docs: ThreadDocumentUI[]): string {
  const withContent = docs.filter((d) => d.content?.trim());
  if (withContent.length === 0) {
    return '';
  }

  const formatted = withContent
    .map((doc) => `[${doc.name}]:\n${doc.content}`)
    .join('\n\n');

  return `\n\n<thread_documents>\n${formatted}\n</thread_documents>\n\nIMPORTANT: The user has attached the documents above. Use them to answer the question. If the information is found in thread_documents, use it first.`;
}

export const conversationChain = async ({
  models,
  config,
}: ConversationChainParams): Promise<BaseChatChainOutput> => {
  validateAnswerGenerator(models.answerGenerator);

  return {
    stream: async (input) => {
      // Step 1: Sanitize and validate the input
      const sanitizedInput = sanitizeAndValidateInput(input);

      // Step 2: Guardrails. This chain is sequential either way — there is no
      // rephrase call to run beside, so the `MASK` split that `basic-rag`
      // needs does not arise here.
      let guardedInput = sanitizedInput;
      if (config?.tracking?.organizationId) {
        const guardrails = await getOrgGuardrailsQuery(
          config.tracking.organizationId,
        );
        const { question, chatHistory } = await runInputGuardrailsCommand({
          guardrails,
          moderator: models.contentModerator,
          question: sanitizedInput.question,
          chatHistory: sanitizedInput.chat_history,
          // This chain has never moderated the history, only the question.
          // Preserved rather than unified with `basic-rag`: changing what the
          // built-in detector reads is a behaviour change, and this phase is
          // moving a decision, not a behaviour.
          moderateHistory: false,
          organizationId: config.tracking.organizationId,
          userId: config.tracking.userId,
          source: 'chat',
          // So a judge model's cost lands on the right project and user, not
          // only the right organization.
          tracking: config.tracking,
        });
        guardedInput = {
          ...sanitizedInput,
          question,
          chat_history: chatHistory,
        };
      }

      // Step 3: Build messages and stream the answer
      const { textDocs, imageDocs } = config?.threadDocuments?.length
        ? partitionThreadDocuments(config.threadDocuments)
        : { textDocs: [], imageDocs: [] };

      const { system, messages } = buildConversationMessages(
        guardedInput.question,
        guardedInput.chat_history,
        config?.answerInstructions,
        config?.projectInstruction,
        imageDocs.length > 0 ? imageDocs : undefined,
      );

      const hasTools =
        config?.mcpTools && Object.keys(config.mcpTools).length > 0;

      let effectiveSystem = system;

      if (textDocs.length > 0) {
        effectiveSystem += formatThreadDocuments(textDocs);
      }

      if (config?.mcpContext) {
        effectiveSystem += `\n\n${config.mcpContext}`;
      }

      const result = streamText({
        model: models.answerGenerator,
        system: effectiveSystem,
        messages,
        maxOutputTokens: config?.maxTokens,
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'conversation-stream',
        },
        ...(hasTools
          ? {
              tools: config!.mcpTools,
              toolApproval: buildToolApprovalConfig(config!.mcpTools),
              // Conversation mode never *retrieves*, but it does carry
              // attachments: `formatThreadDocuments` appends text documents to
              // the system prompt above, and `imageDocs` go into the message.
              // Both are untrusted content in the prompt, and the gate exists
              // for exactly that — so this is a question about attachments,
              // not about retrieval. It read `false`
              // unconditionally before this, which left write tools unpaused on the one path whose
              // content is user-supplied rather than org-curated.
              //
              // Stated explicitly rather than left to a missing context:
              // `shouldPauseForApproval` fails closed, so silence would pause
              // every write tool in a plain chat with nothing attached.
              runtimeContext: {
                ragContextPresent: textDocs.length > 0 || imageDocs.length > 0,
                approvedToolCalls: [],
              } satisfies ToolGatingContext,
              stopWhen: stepCountIs(MAX_TOOL_STEPS),
            }
          : {}),
      });

      return {
        textStream: result.textStream,
        text: result.text,
        fullStream: mapFullStream(result.fullStream),
        reasoningText: result.reasoningText,
        // Every step, not just the last — the value the monthly cost and
        // token ceilings aggregate.
        //
        // On AI SDK 6 the field for that was `totalUsage`, because `usage`
        // meant the final step alone and a tool-calling turn silently billed
        // one step out of up to MAX_TOOL_STEPS. AI SDK 7 redefined `usage` to
        // span all steps and deprecated `totalUsage` as its alias, so the
        // correct field is `usage` again and the number is unchanged. Do not
        // "restore" `totalUsage` here; it is the deprecated spelling now.
        usage: result.usage,
        // Conversation mode does not touch the knowledge base at all, which
        // is `null` rather than an empty result.
        retrieval: Promise.resolve(null),
      };
    },
  };
};
