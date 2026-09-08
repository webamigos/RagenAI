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
 * question — *is it exactly production* — and their callers mean it literally:
 * `serverLogger` uses it to pick a log level, where staging wants `debug` just
 * as much as a laptop does, so widening it to "any deployment" would drop
 * staging logs to `info`.
 *
 * `isProductionTargetEnv` had a second caller — `[locale]/layout.tsx` gated
 * the vendor's Google Tag Manager container on it. That is gone: the container
 * id was a literal in an Apache-2.0 repository, and self-hosters are told to
 * set `TARGET_ENV=production`, so the gate enrolled them in the vendor's
 * analytics. Analytics now lives in `apps/docs` alone. Do not reach for this
 * constant to re-gate anything vendor-specific — the question you actually
 * want is "is this the vendor's own deployment", and `TARGET_ENV` cannot
 * answer it.
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
