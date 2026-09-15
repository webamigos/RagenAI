import type { LiteLLMLogger } from './logger';
export type WithLiteLLMRetry = <T>(
  operation: string,
  context: Record<string, unknown>,
  fn: () => Promise<T>,
) => Promise<T>;
/**
 * Run a LiteLLM admin-API call with bounded retries for transient failures.
 * Does not retry 4xx (validation / auth / not-found) because those are
 * caller-fixable and retrying won't change the outcome.
 */
export declare function createRetry(logger: LiteLLMLogger): WithLiteLLMRetry;
//# sourceMappingURL=retry.d.ts.map
