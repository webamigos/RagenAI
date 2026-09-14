import { ChainError } from '@/libs/chains/errors';
import { logger } from '@/app/lib/utils/logger';
import type { UsageLimitStatus } from './check-usage-limits-query';

export type UsageLimitDimension =
  'tokens' | 'cost' | 'messages' | 'apiRequests';

/**
 * The ceilings a chat turn is subject to.
 *
 * `apiRequests` is deliberately not one of them. It counts only `AiUsage` rows
 * tagged `metadata.source = 'API'`, so it is the public API's quota — blocking
 * someone typing in the panel because the organization's API integration used
 * up its month would be a refusal they cannot act on or even see the cause of.
 * The API paths enforce it themselves, in `checkApiRequestLimit`.
 */
export const CHAT_USAGE_DIMENSIONS: readonly UsageLimitDimension[] = [
  'tokens',
  'cost',
  'messages',
];

/**
 * Raised when an organization is over one of its monthly ceilings.
 *
 * A `ChainError`, so `SseExceptionFilter` forwards its `code` and the client
 * renders `chain-errors.usage-limit-exceeded` in the reader's language. The
 * message on the error itself is for logs: once a `code` is present the client
 * ignores it (`getErrorMessage`).
 */
export class UsageLimitError extends ChainError {
  constructor(public readonly exceeded: UsageLimitDimension[]) {
    super(
      `Organization usage limit exceeded: ${exceeded.join(', ')}`,
      'usage-limit-exceeded',
    );
    this.name = 'UsageLimitError';
  }
}

/**
 * Throw if the organization is over any of the ceilings that apply here.
 *
 * Takes a status rather than fetching one, so a caller can resolve it
 * alongside its other reads instead of adding a round trip before every turn.
 *
 * Which ceiling was hit reaches the operator through this log line and the
 * admin panel. It deliberately does not reach the user: whichever it was, the
 * only thing they can do is wait for the reset or ask an administrator, so the
 * translated message says that once rather than three times.
 */
export function assertWithinUsageLimits(
  status: UsageLimitStatus,
  context: {
    organizationId: string;
    dimensions?: readonly UsageLimitDimension[];
  },
): void {
  const dimensions = context.dimensions ?? CHAT_USAGE_DIMENSIONS;
  const exceeded = dimensions.filter((d) => status.exceeded[d]);

  if (exceeded.length === 0) {
    return;
  }

  logger.warn(
    {
      organizationId: context.organizationId,
      exceeded,
      current: status.current,
      limits: status.limits,
    },
    'Request refused — organization is over a monthly usage ceiling',
  );

  throw new UsageLimitError(exceeded);
}

/**
 * The proxy's own budget rejection, by the wording of its message.
 *
 * LiteLLM refuses with these when an organization's virtual key is over its
 * `max_budget`, and matching its wording is the only signal it gives. It stays
 * until the proxy stops enforcing budgets — deleting a live refusal signal
 * early would only make it silent, which is how this whole area got into
 * trouble in the first place.
 *
 * Bounded, not `includes`. A bare substring test matches
 * `ExceededBudgetPolicy validation failed`, and misclassifying an unrelated
 * failure as a budget refusal is worse than missing one: the reader is told to
 * wait for next month while the real error goes unreported.
 *
 * Kept here rather than beside one of its callers so there is exactly one copy.
 * There were two: `budget-error.ts` for the chatbot widget and an inline pair
 * of `includes` in `assistant-stream.ts`.
 */
const PROXY_BUDGET_MARKERS = [
  /\bBudget has been exceeded\b/,
  /\bExceededBudget\b/,
] as const;

/**
 * True when a failure means "this organization is over a ceiling" — whether
 * the application refused before the turn or the proxy refused during it.
 */
export function isUsageLimitRefusal(error: unknown): boolean {
  if (error instanceof UsageLimitError) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return PROXY_BUDGET_MARKERS.some((marker) => marker.test(message));
}
