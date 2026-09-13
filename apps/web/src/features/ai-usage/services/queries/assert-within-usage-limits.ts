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
