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
