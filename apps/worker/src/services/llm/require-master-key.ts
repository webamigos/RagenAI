import { isDeployedEnv, normalizeTargetEnv } from '@ragenai/env';

/**
 * Whether this process must have `LITELLM_MASTER_KEY` before it can start.
 *
 * Lives apart from `provider.ts` so it can be tested at all: that module
 * throws while it is being imported and pulls in knex, the logger and the AI
 * SDK on the way, so covering the rule through it would mean mocking four
 * unrelated things to assert one boolean.
 *
 * The rule has two independent escape hatches, and both are deliberate:
 *
 * - a development or test `NODE_ENV`, which covers `npm run dev` and the Jest
 *   suite regardless of what `TARGET_ENV` says;
 * - a `TARGET_ENV` that is not a deployment, which covers a CI run pointed at
 *   the mock proxy. This one used to name `local` and `test` only, so `e2e`
 *   and `ci` fell through and CI threw here instead of using its mock.
 *
 * An **unset or blank** `TARGET_ENV` is treated as a deployment rather than
 * excused. A worker container that never received its configuration is the
 * case this check exists for, and a cleared Railway variable arrives as `''`
 * rather than as `undefined` — which is why the value is normalised instead
 * of compared raw.
 */
export function isMasterKeyRequired(env: NodeJS.ProcessEnv): boolean {
  if (env.LITELLM_MASTER_KEY) {
    return false;
  }

  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    return false;
  }

  const targetEnv = normalizeTargetEnv(env.TARGET_ENV);
  return targetEnv === undefined || isDeployedEnv(targetEnv);
}
