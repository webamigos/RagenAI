/**
 * This app's binding of the shared retry wrapper (ADR-34).
 *
 * Kept as its own module because call sites import `withLiteLLMRetry` from
 * `@/libs/litellm/retry` directly.
 */
import { createRetry } from '@ragenai/litellm-client';
import { logger } from '@/app/lib/utils/logger';

export const withLiteLLMRetry = createRetry(logger);
