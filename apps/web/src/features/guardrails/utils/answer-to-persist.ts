import type {
  GuardrailBlockedMetadata,
  MessageMetadata,
} from '@/features/messages/contracts/message.types';

import { OUTPUT_GUARDRAIL_REFUSAL } from '../constants';

/**
 * What an assistant message holds once the stream has ended.
 *
 * Extracted from the middle of `assistant-stream.ts` because it is the one
 * decision this phase exists to get right — *the refusal is stored, never the
 * withheld text* — and it was living inside a 1200-line generator where
 * nothing could state it. Per `AGENTS.md`, a small file that is the only place
 * a piece of wiring exists is exactly where a mistake fails silently: here the
 * failure is a thread row containing the text a rule stopped, which nobody
 * would look at again until it mattered.
 *
 * Three things it settles, and each has a test:
 *
 * - The accumulated text is dropped on a block, not appended to the refusal.
 *   A reader seeing "…the credentials are hunter2 — the answer was withheld"
 *   has been shown the answer *and* told it was withheld.
 * - The reasoning goes with it. A model's reasoning paraphrases what it was
 *   about to say, so storing it past a block leaks the same content through a
 *   field the panel renders in a collapsible block.
 * - The marker is what the panel localizes off. The stored sentence is
 *   English because `/api/threads` is not under `[locale]`.
 */

export type PersistedAnswer = {
  readonly content: string;
  readonly metadata?: MessageMetadata;
};

export type AnswerToPersistInput = {
  /** What the stream produced. Ignored entirely when `blocked` is set. */
  readonly fullMessage: string;
  /** The rule that refused the answer, or `null` on an ordinary turn. */
  readonly blocked: GuardrailBlockedMetadata | null;
  readonly reasoningContent: string;
  readonly reasoningEffort: 'low' | 'medium' | 'high' | null;
  readonly model: string | null;
};

export function answerToPersist(input: AnswerToPersistInput): PersistedAnswer {
  const { blocked, model } = input;

  if (blocked) {
    return {
      content: OUTPUT_GUARDRAIL_REFUSAL,
      metadata: { guardrailBlocked: blocked, model },
    };
  }

  if (input.reasoningContent.length > 0) {
    return {
      content: input.fullMessage,
      metadata: {
        reasoningContent: input.reasoningContent,
        reasoningEffort: input.reasoningEffort,
        model,
      },
    };
  }

  return { content: input.fullMessage };
}
