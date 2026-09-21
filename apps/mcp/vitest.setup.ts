/**
 * `TARGET_ENV` for the test process. Wired as vitest's `setupFiles`.
 *
 * The env schema requires it rather than defaulting to `local`
 * (`targetEnvRequired`), because the variable decides whether the deployed
 * rules apply and a forgiving default disables them silently. A developer's
 * shell gets it from `.env.local`; the test runner starts from a bare
 * `process.env`, and any suite that reaches `getEnv()` — the API client does,
 * for `RAGEN_API_URL` — would otherwise fail on a variable it is not testing.
 *
 * `config/__tests__/env.test.ts` replaces `process.env` wholesale, so it still
 * exercises the absent case on its own terms. Vitest runs this file once per
 * test file rather than once per process, which that suite does not mind: it
 * restores the environment it captured itself.
 */
process.env.TARGET_ENV ??= 'local';
