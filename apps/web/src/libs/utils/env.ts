/**
 * Two unrelated questions live here, and conflating them causes bugs.
 *
 * `NODE_ENV` is about how this build was compiled. `TARGET_ENV` is about which
 * deployment it belongs to, and the two are independent — a production build
 * running against a staging database is normal.
 *
 * **These are not the "is this a real deployment" predicate.** That one is
 * `isDeployedEnv()` in `@ragenai/env`, shared with the config validator, the
 * storage provider and the worker. The constants below ask a narrower
 * question — *is it exactly production* — and their two callers mean it
 * literally: `layout.tsx` uses it to decide whether to inject Google Tag
 * Manager, and `serverLogger` to pick a log level. Widening either to "any
 * deployment" would start tracking staging visitors in the production GTM
 * container and drop staging logs from `debug` to `info`.
 *
 * `isLocalTargetEnv` and `isStagingTargetEnv` used to sit here too, with no
 * callers in either this file's app or the byte-identical copy in
 * `apps/worker/src/utils/env.ts`. They are gone: an unused environment
 * predicate is an invitation to reach for the wrong one.
 */
export const isProduction = process.env.NODE_ENV === 'production';
export const isDevelopment = process.env.NODE_ENV === 'development';

export const isTestTargetEnv = process.env.TARGET_ENV === 'test';
export const isProductionTargetEnv = process.env.TARGET_ENV === 'production';
