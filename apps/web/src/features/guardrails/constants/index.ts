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
 * What is stored in place of an answer an `OUTPUT` rule refused.
 *
 * The withheld text is never stored — that is the whole point of the rule —
 * and an empty assistant message would read as a bug rather than a decision,
 * both in the thread and to anyone reading the row later.
 *
 * English, and deliberately not the only thing the reader sees. The panel
 * renders `assistant.chat.guardrail-blocked-answer` in their own language off
 * `metadata.guardrailBlocked`, because an API route has no locale to translate
 * with: `/api/threads` is not under `[locale]`, so `getTranslations` would
 * answer in the default one for everybody. Storing this sentence and
 * localizing at render is what keeps a Polish reader from meeting English on
 * reload, while an export or an API read still gets a sentence rather than a
 * blank.
 */
export const OUTPUT_GUARDRAIL_REFUSAL =
  "The answer was withheld because it matched a rule set by your organization's administrator.";
