'use server';

import {
  describePolicyFailure,
  validatePolicy,
  type PolicyTrialResult,
} from '@ragenai/guardrails';

import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth-guard';
import { logger } from '@/lib/logger';

/**
 * Run a draft policy against text the operator pasted.
 *
 * The judge is **not** here. apps/web holds it, and this posts to an internal
 * endpoint in that app for one reason worth stating where somebody might undo
 * it: apps/web is a runtime that serves chat, so a trial run there exercises
 * the binding real traffic passes through. A judge in this panel would be a
 * third one — a third model id, a third timeout, a third reading of a provider
 * error — and an operator would tune a threshold against a number no turn ever
 * produces. `tests/architecture/guardrails-are-not-recopied.test.ts` asserts
 * there are exactly two judge bindings, and that assertion is the record of
 * this decision.
 *
 * `RAGEN_APP_URL` and `INTERNAL_API_SECRET` are the same pair
 * `resendInvitationAction` already needs, so this adds no configuration to a
 * panel that is deployed beside apps/web anyway. When they are missing, the
 * box says so instead of the rest of the form breaking.
 */

export type PolicyTrialOutcome =
  | (PolicyTrialResult & {
      readonly judgedText: string;
      readonly masked: boolean;
    })
  | { readonly outcome: 'unavailable'; readonly reason: string };

export type PolicyTrialRequest = {
  policy: string;
  threshold: number | null;
  text: string;
};

const TRIAL_TIMEOUT_MS = 15_000;

export async function testPolicyAction(
  input: PolicyTrialRequest,
): Promise<PolicyTrialOutcome> {
  const admin = await requireAdmin();

  if (typeof input.text !== 'string' || input.text.trim().length === 0) {
    return {
      outcome: 'unavailable',
      reason: 'Paste a message to test the policy against.',
    };
  }

  // Refused here as well as in apps/web, so an operator who has not written a
  // policy yet gets the field-level message rather than a 422 relayed through
  // two processes.
  const verdict = validatePolicy({
    policy: input.policy,
    threshold: input.threshold,
  });
  if (!verdict.ok) {
    return {
      outcome: 'unavailable',
      reason: describePolicyFailure(verdict.failure),
    };
  }

  const appUrl = process.env.RAGEN_APP_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!appUrl || !secret) {
    return {
      outcome: 'unavailable',
      reason:
        'Testing a policy runs the judge in apps/web, which needs ' +
        'RAGEN_APP_URL and INTERNAL_API_SECRET configured on the admin app.',
    };
  }

  let outcome: PolicyTrialOutcome;
  try {
    const response = await fetch(
      `${appUrl}/api/internal/guardrails/judge-policy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': secret,
        },
        body: JSON.stringify({
          policy: input.policy,
          threshold: input.threshold,
          text: input.text,
          adminUserId: admin.id,
        }),
        // Longer than the judge's own 3 s, because a trial may also wait on
        // Presidio — whose cold start is the reason that client allows 15 s.
        signal: AbortSignal.timeout(TRIAL_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      outcome = {
        outcome: 'unavailable',
        reason:
          detail?.error ?? `apps/web refused the trial: ${response.status}`,
      };
    } else {
      outcome = (await response.json()) as PolicyTrialOutcome;
    }
  } catch (error) {
    outcome = {
      outcome: 'unavailable',
      // The name alone. A fetch failure carries the request it sent, and the
      // request body here is the operator's pasted text — the C2 lesson,
      // applied to the panel.
      reason: `Could not reach apps/web: ${error instanceof Error ? error.name : 'unknown'}`,
    };
  }

  if (outcome.outcome === 'unavailable') {
    logger.warn(
      { adminUserId: admin.id, reason: outcome.reason },
      'Policy trial did not run',
    );
  }

  // **Audited either way, and this is the only record a trial leaves.** No
  // AI-usage row is written — `AiUsage.organizationId` is required, and a
  // platform admin testing a draft has no tenant to bill — so without this
  // entry a judge model could be called repeatedly with nothing anywhere
  // saying who did it.
  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.guardrailPolicyTested,
    entityType: 'guardrail',
    entityId: 'draft',
    after: {
      outcome: outcome.outcome,
      threshold: input.threshold,
      // The score, never the text. The pasted message and the policy prose
      // both stay out of the audit trail: an audit entry is read by people who
      // are not the operator who wrote it.
      score: outcome.outcome === 'scored' ? outcome.score : null,
    },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  return outcome;
}
