/**
 * `TARGET_ENV` for the test process.
 *
 * The env schema requires it rather than defaulting to `local`
 * (`targetEnvRequired`), because the variable decides whether the deployed
 * rules apply and a forgiving default disables them silently. A developer's
 * shell gets it from `.env.local`; Jest starts from a bare `process.env`, and
 * any suite that reaches `getEnv()` — the API client does, for
 * `RAGEN_API_URL` — would otherwise fail on a variable it is not testing.
 *
 * `config/__tests__/env.test.ts` replaces `process.env` wholesale, so it still
 * exercises the absent case on its own terms.
 */
process.env.TARGET_ENV ??= 'local';
