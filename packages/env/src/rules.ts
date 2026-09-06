import { z } from 'zod';

import { isDeployedEnv } from './target-env';

type Ctx = z.RefinementCtx;
type Env = Record<string, unknown>;

const isSet = (value: unknown): boolean =>
  typeof value === 'string' && value.trim() !== '';

/**
 * Require a set of variables only when a deployment is real.
 *
 * A great deal of this configuration is genuinely optional locally and
 * genuinely mandatory on a deployment — a missing `LITELLM_MASTER_KEY` is a
 * warning on a laptop and a broken deployment on Railway. Encoding that as
 * `.optional()` loses the second half; encoding it as required breaks
 * `npm run dev` on a fresh clone.
 *
 * "Real" comes from `isDeployedEnv()` rather than a local `staging ||
 * production` test. The two agree on every value that existed when this was
 * written; the difference is that a newly added environment now inherits
 * these checks instead of silently escaping them.
 */
export function requiredInDeployedEnvs(
  env: Env,
  ctx: Ctx,
  names: readonly string[],
  reason?: string,
): void {
  const targetEnv = env.TARGET_ENV;
  if (typeof targetEnv !== 'string' || !isDeployedEnv(targetEnv)) {
    return;
  }

  for (const name of names) {
    if (!isSet(env[name])) {
      ctx.addIssue({
        code: 'custom',
        message: `${name} is required when TARGET_ENV is "${targetEnv}"${reason ? ` — ${reason}` : ''}`,
        path: [name],
      });
    }
  }
}

/**
 * A group of variables that only means anything complete.
 *
 * Pusher is the worked example: with two of its three credentials set, the
 * client constructs and then fails per-request, which surfaces as
 * "notifications sometimes do not arrive" rather than as a configuration
 * error. Half-configured is worse than absent, because absent has a
 * documented fallback and half does not.
 */
export function allOrNone(
  env: Env,
  ctx: Ctx,
  names: readonly string[],
  groupLabel: string,
): void {
  const setCount = names.filter((name) => isSet(env[name])).length;

  if (setCount === 0 || setCount === names.length) {
    return;
  }

  const missing = names.filter((name) => !isSet(env[name]));
  ctx.addIssue({
    code: 'custom',
    message: `${groupLabel} is half-configured: ${names.join(', ')} must all be set or all be omitted (missing: ${missing.join(', ')})`,
    path: [names[0] as string],
  });
}

/**
 * Require the variables a chosen provider needs.
 *
 * The provider seams — `STORAGE_PROVIDER`, `RERANK_PROVIDER`,
 * `ENCRYPTION_PROVIDER`, `MAIL_PROVIDER` — all share this shape: one string
 * picks an implementation, and that choice makes a different set of
 * credentials mandatory. Selecting `s3` and supplying no bucket is a
 * configuration error that currently only shows up at the first upload.
 */
export function requiredForProvider(
  env: Env,
  ctx: Ctx,
  providerVar: string,
  providerValue: string,
  names: readonly string[],
): void {
  if (env[providerVar] !== providerValue) {
    return;
  }

  for (const name of names) {
    if (!isSet(env[name])) {
      ctx.addIssue({
        code: 'custom',
        message: `${name} is required when ${providerVar} is "${providerValue}"`,
        path: [name],
      });
    }
  }
}
