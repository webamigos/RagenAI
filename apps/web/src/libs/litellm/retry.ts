import { logger } from '@/app/lib/utils/logger';

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 200;

// LiteLLM client functions throw `Error` with a prefixed message that
// embeds the HTTP status. This regex extracts the status so we can
// decide whether the failure is retryable.
const STATUS_REGEX = /:\s(\d{3})\s/;

function extractHttpStatus(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const match = STATUS_REGEX.exec(error.message);
  return match ? Number(match[1]) : null;
}

function isRetryable(error: unknown): boolean {
  const status = extractHttpStatus(error);
  if (status == null) {
    // Network / AbortError — retry
    return true;
  }
  return status >= 500;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a LiteLLM admin-API call with bounded retries for transient failures.
 * Does not retry 4xx (validation / auth / not-found) because those are
 * caller-fixable and retrying won't change the outcome.
 */
export async function withLiteLLMRetry<T>(
  operation: string,
  context: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS || !isRetryable(error)) {
        logger.error(
          {
            ...context,
            operation,
            attempt,
            err: error,
          },
          'LiteLLM call failed (not retrying)',
        );
        throw error;
      }
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      logger.warn(
        {
          ...context,
          operation,
          attempt,
          nextDelayMs: delay,
          err: error,
        },
        'LiteLLM call failed, retrying',
      );
      await sleep(delay);
    }
  }
  throw lastError;
}
