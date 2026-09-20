/**
 * The cache windows are the package's.
 *
 * They were declared here and again, privately, in `apps/api`'s loader — two
 * copies of a number the documentation promises in four places. Re-exported
 * rather than removed so the existing import sites keep reading, and so this
 * file says where the answer lives.
 */
export {
  GUARDRAIL_CACHE_TTL_MS,
  GUARDRAIL_FAILURE_TTL_MS,
} from '@ragenai/guardrails';

/**
 * The refusal is the package's, because `apps/api` persists the same sentence.
 *
 * Re-exported rather than moved out of reach so the call sites here keep
 * reading, and so this file says where the answer lives — exactly as the cache
 * windows above it do.
 */
export { OUTPUT_GUARDRAIL_REFUSAL } from '@ragenai/guardrails';
