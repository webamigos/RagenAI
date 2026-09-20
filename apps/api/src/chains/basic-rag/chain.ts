import { streamText, stepCountIs } from 'ai';
import { buildToolApprovalConfig } from '../../mcp/client.js';
import {
  rephraseAndExpand,
  retrieveRelevantDocumentsWithIds,
  retrieveThreadDocuments,
  buildRagMessages,
  validateAnswerGenerator,
} from './operations.js';

import { sanitizeAndValidateInput } from '../utils/common-operations/index.js';
import type { BasicRagChainParams } from '../types/basic-rag.js';
import { MAX_TOOL_STEPS } from '../types/common.js';
import type { BaseChatChainOutput } from '../types/common.js';
import { partitionThreadDocuments } from '../utils/chain-utils.js';
import { mapFullStream, textOfStream } from '../utils/stream-mapper.js';

// Kept async to preserve the original apps/web call signature (`await
// basicRagChain(...)`) — only the nested `stream` function below awaits.
// The multiline destructured signature puts the `=>` several lines below
// the `async` keyword, so `eslint-disable-next-line` can't target it —
// use a block disable instead.
/* eslint-disable @typescript-eslint/require-await */
export const basicRagChain = async ({
  vectorStore,
  models,
  config,
}: BasicRagChainParams): Promise<BaseChatChainOutput> => {
  /* eslint-enable @typescript-eslint/require-await */
  validateAnswerGenerator(models.answerGenerator);

  return {
    stream: async (input) => {
      // Step 1: Sanitize and validate the input
      const sanitizedInput = sanitizeAndValidateInput(input);

      // Step 2: Guardrails, then rephrase+expand. These ran concurrently
      // until the input stage gained rules that can refuse the turn — see
      // the note above the two awaits below for why that had to stop.
      // The merged rephraseAndExpand() produces the standalone question AND
      // query variants in a single LLM call (saves another round-trip vs the
      // old sequential rephrase → expandQueries flow).
      const multiQueryEnabled = config?.ragSettings?.multiQueryEnabled ?? true;

      // Guardrails replace the `MODERATION_ENABLED` read that used to gate
      // this. What runs is now a row an administrator can see, and an empty
      // rule set is the off switch.
      const guardrails = config?.guardrails;
      const evaluateGuardrails = async () => {
        if (!guardrails || guardrails.rules.length === 0) {
          return sanitizedInput;
        }
        const { question, chatHistory } = await guardrails.run({
          question: sanitizedInput.question,
          chatHistory: sanitizedInput.chat_history,
          // This chain has always moderated the question together with the
          // history. Preserved rather than unified with apps/web's other
          // chain: this phase moves a decision, not a behaviour.
          moderateHistory: true,
        });
        return { ...sanitizedInput, question, chat_history: chatHistory };
      };

      // Sequential, and it has to be — the same change apps/web's chain
      // carries, for the same reason and worth stating twice rather than
      // leaving one runtime to be found later.
      //
      // Running `evaluateGuardrails()` beside `rephraseAndExpand` meant a
      // question a `BLOCK` rule refuses had already been sent to the
      // rephraser, which is a model call to an external provider on most
      // installations. "Blocked" then described what the reader saw, not
      // where the text went. Whichever promise rejected first also decided
      // which error surfaced, so a rephraser failure hid the refusal behind
      // `unknown-error`.
      //
      // The cost is one round-trip of latency on a turn with rules enabled.
      const guardedInput = await evaluateGuardrails();
      const rephrased = await rephraseAndExpand(
        models.questionRephraser,
        guardedInput,
        multiQueryEnabled,
        undefined,
        config?.tracking,
        config?.trackAiUsage,
      );

      const { standaloneQuestion, variants } = rephrased;

      // Defensively dedupe the full query list (order-preserving) so any
      // future change in rephraseAndExpand cannot cause redundant Qdrant
      // round-trips.
      const seenQueries = new Set<string>();
      const retrievalQueries = [standaloneQuestion, ...variants].filter((q) => {
        const key = q.trim().toLowerCase();
        if (seenQueries.has(key)) {
          return false;
        }
        seenQueries.add(key);
        return true;
      });

      // Step 4: Partition thread documents — images go to multimodal message, text to retrieval
      const { textDocs: textThreadDocs, imageDocs: imageThreadDocs } =
        partitionThreadDocuments(config?.threadDocuments || []);

      // Step 5: Retrieve KB documents and thread documents in parallel
      const [{ context, fileIds }, threadContext] = await Promise.all([
        retrieveRelevantDocumentsWithIds(
          vectorStore,
          retrievalQueries,
          config?.maxDocumentsToRetrieve,
          config?.metadataFilter,
          config?.ragSettings?.rerankingEnabled ?? true,
          config?.tracking,
          config?.trackAiUsage,
        ),
        retrieveThreadDocuments(
          textThreadDocs,
          vectorStore,
          models.embeddings,
          standaloneQuestion,
          config?.maxDocumentsToRetrieve ?? 3,
        ),
      ]);

      // Step 5: Build messages and stream the answer
      const { system, messages } = buildRagMessages(
        standaloneQuestion,
        // The guarded history, not the sanitized one. Masking the input and
        // then handing the model the original is the exact failure a mask
        // exists to prevent — and it would look like the rule working: the
        // event is recorded and the placeholder is in the retrieval query.
        guardedInput.chat_history,
        context,
        threadContext,
        config?.answerInstructions,
        config?.projectInstruction,
        imageThreadDocs.length > 0 ? imageThreadDocs : undefined,
      );

      const hasTools =
        config?.mcpTools && Object.keys(config.mcpTools).length > 0;

      const effectiveSystem = config?.mcpContext
        ? `${system}\n\n${config.mcpContext}`
        : system;

      // Phase 2 prompt-injection gating: tell the MCP tool wrappers
      // whether retrieved RAG context is present in this turn. Write
      // tools consult this via their `needsApproval` predicate and
      // pause execution when true (exfiltration via malicious document
      // content is the vector we're closing). `approvedToolCalls` is
      // always empty in Phase 2a; Phase 2b will populate it from the
      // request body on explicit user approval.
      // Every kind of retrieved or attached text counts, not just the
      // knowledge base. `buildRagMessages` puts `threadContext` into the system
      // prompt as well, so an instruction inside an attached document reaches
      // the model exactly like one inside a retrieved chunk — and an attachment
      // is the *less* vetted of the two. Checking only `context` left the gate
      // open for MODEL_ONLY, the one level guaranteed to have no `context`.
      //
      // `threadContext` cannot be tested on its own: with no documents
      // `retrieveThreadDocuments` returns a non-empty "no documents" marker, so
      // a bare `.trim().length` is always true. Ask whether there were
      // documents first.
      //
      // Images count too, and they are the easiest of the three to overlook:
      // `imageThreadDocs` never touches `context` or `threadContext` — it goes
      // straight into the multimodal message — so an image-only turn produced
      // `false` here while the attachment reached the model. A vision model
      // reads instructions rendered into a picture as readily as typed ones,
      // and an uploaded image is no more vetted than an uploaded document.
      // Unlike `threadContext` there is no marker to work around, so the
      // length of the array is the whole test.
      const ragContextPresent =
        context.trim().length > 0 ||
        (textThreadDocs.length > 0 && threadContext.trim().length > 0) ||
        imageThreadDocs.length > 0;
      const toolGatingContext = {
        ragContextPresent,
        approvedToolCalls: config?.approvedToolCalls ?? [],
      };

      const result = streamText({
        model: models.answerGenerator,
        system: effectiveSystem,
        messages,
        maxOutputTokens: config?.maxTokens,
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'basic-rag-stream',
        },
        // `runtimeContext` is AI SDK 7's `experimental_context`. It reaches
        // each write tool's approval function, which fails closed without it.
        runtimeContext: toolGatingContext,
        ...(hasTools
          ? {
              tools: config.mcpTools,
              toolApproval: buildToolApprovalConfig(config.mcpTools),
              stopWhen: stepCountIs(MAX_TOOL_STEPS),
            }
          : {}),
      });

      // The output window, or nothing. `mapFullStream` returns its own
      // iterator unwrapped when there is no stage, so an organization with no
      // output rules is not buffered.
      const guardedStream = mapFullStream(
        result.fullStream,
        config?.guardrails?.outputStage?.(),
      );

      return {
        // One mapped stream, and `textStream` is a view of it. They share an
        // iterator, so a caller consumes one of them and not both — which is
        // what keeps the window single: two would each hold their own buffer
        // and each file its own hit for the same answer. Before this, the
        // text view was the SDK's own and never met the window at all, so a
        // rule applied to whichever surfaces happened to read `fullStream`.
        textStream: textOfStream(guardedStream),
        text: result.text,
        fullStream: guardedStream,
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
        sourceFileIds: Promise.resolve(fileIds),
      };
    },
  };
};
