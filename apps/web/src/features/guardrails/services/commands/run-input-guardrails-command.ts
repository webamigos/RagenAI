import {
  applyMask,
  runPatternRules,
  type PatternHit,
  type ResolvedGuardrail,
} from '@ragenai/guardrails';

import type { ModerationInstance } from '@/app/lib/services/llm';
import { logger } from '@/app/lib/utils/logger';
import { GuardrailError } from '@/libs/chains/errors';
import type { SecurityEventSource } from '@/features/security/contracts/security-event.types';

import type { OrgGuardrails } from '../../contracts/guardrail-runtime.types';
import {
  evaluateModeration,
  isModerationRule,
} from '../../utils/moderation-evaluator';
import { recordGuardrailHit } from '../../utils/record-guardrail-hit';

/**
 * Evaluate an organization's input rules against one turn.
 *
 * This is what replaces `moderateContent()`. The difference that matters is not
 * how moderation is performed — that is still the same provider call — but
 * that *whether* it runs is now a row an administrator can see, and that other
 * kinds of rule run beside it.
 *
 * Returns the text to carry on with, because a `MASK` rule rewrites it. A
 * caller that ignores the return value gets the original and silently defeats
 * every masking rule, which is why the result is the text and not a verdict.
 */

export type InputGuardrailInput = {
  readonly guardrails: OrgGuardrails;
  readonly moderator: ModerationInstance | undefined;
  readonly question: string;
  /**
   * Optional because the chains' own input type has it optional — a first turn
   * has no history. Normalised to `''` once, here, rather than at each call
   * site, so a caller cannot accidentally pass `undefined` into `applyMask`.
   */
  readonly chatHistory: string | undefined;
  /**
   * Whether the built-in moderator sees the history as well as the question.
   *
   * Preserved per chain rather than unified: `basic-rag` has always moderated
   * `question + chat_history` and `conversation-chain` has always moderated
   * the question alone. Changing either here would be a behaviour change
   * smuggled in beside a configuration change — the thing this phase is
   * explicitly trying not to do.
   */
  readonly moderateHistory: boolean;
  readonly organizationId: string;
  readonly userId?: string | null;
  readonly source: SecurityEventSource;
};

export type InputGuardrailResult = {
  readonly question: string;
  readonly chatHistory: string;
};

/**
 * `BLOCK` wins over everything, and the first one wins.
 *
 * Evaluating the rest after a block would spend the turn's budget producing
 * events for a turn that is about to be refused, and would mask text nobody
 * will see.
 */
function firstBlocking(hits: readonly PatternHit[]): PatternHit | undefined {
  return hits.find((hit) => hit.rule.action === 'BLOCK');
}

export async function runInputGuardrailsCommand(
  input: InputGuardrailInput,
): Promise<InputGuardrailResult> {
  const { guardrails, organizationId, userId, source } = input;
  const chatHistory = input.chatHistory ?? '';
  const unchanged = { question: input.question, chatHistory };

  if (guardrails.input.length === 0) {
    return unchanged;
  }

  const record = (rule: ResolvedGuardrail, matchCount?: number) =>
    recordGuardrailHit({
      rule,
      organizationId,
      userId,
      source,
      stage: 'INPUT',
      matchCount,
    });

  const refuse = (rule: ResolvedGuardrail): never => {
    record(rule);
    throw new GuardrailError(rule.publicId, rule.key ?? rule.name);
  };

  // Pattern rules first, and only against the current message.
  //
  // Not the history: a `BLOCK` evaluated over `chat_history` refuses this turn
  // because of something said earlier that was already allowed through, which
  // makes a thread permanently unusable after one borderline message and gives
  // the user no way to see why. History is masked below, which is a different
  // operation — it changes what the model is shown, it does not refuse
  // anything.
  const patternRules = guardrails.input.filter(
    (rule) => rule.kind === 'PATTERN',
  );
  // `runPatternRules` is typed over `GuardrailRule`, and everything here needs
  // the `ResolvedGuardrail` that went in — it carries the severity and the
  // source the event is written from. Looked up rather than cast: a cast would
  // still compile if the package ever stopped returning the same objects.
  const resolved = new Map(
    guardrails.input.map((rule) => [rule.publicId, rule]),
  );
  const asResolved = (rule: { publicId: string }): ResolvedGuardrail => {
    const found = resolved.get(rule.publicId);
    if (!found) {
      throw new Error(
        `Guardrail ${rule.publicId} came back from the evaluator but is not in the resolved set`,
      );
    }
    return found;
  };
  const { hits, skipped, elapsedMs } = runPatternRules(
    patternRules,
    input.question,
  );

  if (skipped.length > 0) {
    // A rule that did not run is a rule that protected nothing. Said out loud
    // rather than swallowed, because the alternative is an organization whose
    // guardrails quietly stop applying as it adds more of them.
    logger.warn(
      {
        audit: true,
        organizationId,
        elapsedMs,
        skipped: skipped.map((rule) => rule.publicId),
      },
      'Guardrail budget exhausted; some pattern rules did not run',
    );
  }

  const blockingPattern = firstBlocking(hits);
  if (blockingPattern) {
    refuse(asResolved(blockingPattern.rule));
  }

  // The built-in detector, if the organization has it on. After the patterns
  // because it is the expensive one: a local regex that already refuses the
  // turn should not be preceded by a network round-trip.
  const moderationRule = guardrails.input.find(isModerationRule);
  if (moderationRule) {
    const text = input.moderateHistory
      ? `${input.question} ${chatHistory}`
      : input.question;
    const verdict = await evaluateModeration(input.moderator, text);

    if (verdict.outcome === 'hit') {
      if (moderationRule.action === 'BLOCK') {
        refuse(moderationRule);
      }
      record(moderationRule);
    }
    // `error` is neither: the adapter has already logged it, and treating a
    // provider failure as a hit would let an outage refuse every turn.
  }

  for (const hit of hits.filter((h) => h.rule.action === 'LOG')) {
    record(asResolved(hit.rule), hit.spans.length);
  }

  const questionMaskHits = hits.filter((hit) => hit.rule.action === 'MASK');

  // History is masked against **every** mask rule, not against the ones the
  // question happened to match.
  //
  // Deriving the history's rules from the question's hits was the first
  // version of this, and it is wrong in the exact case masking exists for.
  // `chat_history` is assembled from stored messages, and the stored message
  // is deliberately the original — masking changes what the model is given,
  // not what the thread records. So the secret is in turn one's history while
  // turn two's question is innocent: the question matches nothing, and a
  // history gated on the question's hits is never masked at all. The rule
  // would protect exactly one turn and then stop, which is indistinguishable
  // from it working.
  const maskRules = patternRules.filter((rule) => rule.action === 'MASK');
  const historyHits =
    chatHistory.length > 0 && maskRules.length > 0
      ? runPatternRules(maskRules, chatHistory).hits
      : [];

  if (questionMaskHits.length === 0 && historyHits.length === 0) {
    return unchanged;
  }

  // One event per rule that fired, counting spans across both halves — the
  // same match in the question and in the history is one rule firing, not two.
  const spansByRule = new Map<string, number>();
  for (const hit of [...questionMaskHits, ...historyHits]) {
    spansByRule.set(
      hit.rule.publicId,
      (spansByRule.get(hit.rule.publicId) ?? 0) + hit.spans.length,
    );
  }
  for (const [publicId, matchCount] of spansByRule) {
    record(asResolved({ publicId }), matchCount);
  }

  return {
    question: applyMask(input.question, questionMaskHits),
    chatHistory: applyMask(chatHistory, historyHits),
  };
}
