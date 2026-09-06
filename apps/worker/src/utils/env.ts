/**
 * This file was a byte-identical copy of `apps/web/src/libs/utils/env.ts`:
 * six exported constants, of which the worker ever imported one. The other
 * five were dead in both apps, and two of them — `isLocalTargetEnv` and
 * `isStagingTargetEnv` — were the kind of half-written environment predicate
 * someone reaches for instead of the real one.
 *
 * The real one is `isDeployedEnv()` in `@ragenai/env`. It is not this: the
 * constant below asks whether the environment is *exactly* production, and
 * its single caller means that literally — `services/logger.ts` uses it to
 * choose a Pino level, where staging wants `debug` just as much as a laptop
 * does.
 */
export const isProductionTargetEnv = process.env.TARGET_ENV === 'production';
