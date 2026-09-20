import type { ResolvedGuardrail } from '@ragenai/guardrails';

import type { ModerationInstance } from '@/app/lib/services/llm';
import { logger } from '@/app/lib/utils/logger';

/**
 * The `content-moderation` built-in, over the provider client that already
 * exists.
 *
 * Phase B moves *what decides* moderation from an environment variable to a
 * row. It does not change *how* moderation is performed — that is still
 * OpenAI's moderation endpoint through `createModerationInstance()`, which
 * `moderateContent()` has been calling all along. Reimplementing it here would
 * have meant a second provider call site to keep in step, and a behaviour
 * change smuggled in beside a configuration change.
 *
 * So this is an adapter and nothing more: it turns a rule plus some text into
 * a verdict, and it is the only thing that knows the built-in's key maps to
 * this provider.
 */

export type GuardrailVerdict =
  | { readonly outcome: 'pass' }
  | { readonly outcome: 'hit' }
  /**
   * The evaluator could not reach a verdict.
   *
   * Separate from `pass` even though both let the turn through, because the
   * two are different facts and only one of them is worth an alert. Folding
   * them together is how "the moderation provider has been down for a week"
   * becomes indistinguishable from "nothing was flagged".
   */
  | { readonly outcome: 'error'; readonly reason: string };

/** The built-in this adapter serves. */
export const MODERATION_GUARDRAIL_KEY = 'content-moderation';

export function isModerationRule(rule: ResolvedGuardrail): boolean {
  return rule.kind === 'BUILT_IN' && rule.key === MODERATION_GUARDRAIL_KEY;
}

/**
 * Ask the provider, and treat a failure as a pass.
 *
 * The same choice the jailbreak classifier already makes, and the spec states
 * it for the judge model too: a classifier that can take the product down is a
 * bigger risk than the one it catches. The difference from today is that the
 * failure is now visible — `outcome: 'error'` reaches the caller, where
 * `moderateContent()` would simply have thrown a `ModerationError` and been
 * indistinguishable from a real flag.
 */
export async function evaluateModeration(
  moderator: ModerationInstance | undefined,
  text: string,
): Promise<GuardrailVerdict> {
  if (!moderator) {
    // Reachable: the instance is built from provider credentials, and a rule
    // can be enabled on an installation that has none. That is a
    // misconfiguration worth a log, not a reason to refuse the turn — the
    // operator enabled a check this deployment cannot perform.
    logger.warn(
      { audit: true },
      'content-moderation is enabled but no moderation provider is configured',
    );
    return { outcome: 'error', reason: 'no-moderation-provider' };
  }

  try {
    const { results } = await moderator.invoke({ input: text });
    const result = results[0];

    if (!result) {
      // A response with no results is not a clean bill of health. The old
      // `runModeration` threw `ModerationError` here, which the chain then
      // rendered to the user as a content refusal — a provider shape problem
      // presented as "your message was rejected".
      return { outcome: 'error', reason: 'no-results' };
    }

    return result.flagged ? { outcome: 'hit' } : { outcome: 'pass' };
  } catch (err) {
    logger.error({ err, audit: true }, 'Moderation provider call failed');
    return {
      outcome: 'error',
      reason: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
    };
  }
}
