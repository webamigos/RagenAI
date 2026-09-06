/**
 * Which `TARGET_ENV` values name a real deployment, in one place.
 *
 * Before this, seven call sites answered that question in three mutually
 * inconsistent shapes:
 *
 * - `rules.ts` and `@ragenai/storage` allowlisted `staging || production`;
 * - `apps/web`'s email base URL denylisted `local | test | e2e | ci`;
 * - `apps/worker`'s LLM provider denylisted `local | test` only — which is a
 *   live bug, not a stylistic difference: a CI run takes the "deployed"
 *   branch and demands `LITELLM_MASTER_KEY`.
 *
 * Three shapes of the same rule is exactly the drift ADR-33 was written
 * about, and the copies could not be typechecked against each other because
 * each derived its own list from its own literals.
 *
 * ## Why a denylist
 *
 * `TARGET_ENV` is a closed enum (`TARGET_ENV_VALUES` below, enforced by zod),
 * so allowlisting the deployed values and denylisting the non-deployed ones
 * are exhaustive over the same set *today*. They differ only in which side a
 * newly added value lands on, and that is the whole decision:
 *
 * - allowlist → a new environment is not deployed, so every
 *   `requiredInDeployedEnvs` rule waves its deploy through unvalidated;
 * - denylist → a new environment is deployed, so it must satisfy the same
 *   configuration checks as staging and production until someone says
 *   otherwise.
 *
 * The second fails safe. Adding `demo` to the enum therefore opts it into the
 * validation rather than out of it, with no further edit.
 */

/**
 * Every environment this repository ships to or runs in.
 *
 * Declared here rather than in `fragments.ts` so the enum and the predicate
 * over it cannot disagree — `fragments.ts` imports this.
 */
export const TARGET_ENV_VALUES = [
  'local',
  'test',
  'e2e',
  'ci',
  'demo',
  'staging',
  'production',
] as const;

export type TargetEnv = (typeof TARGET_ENV_VALUES)[number];

/**
 * The values that mean "not a deployment": a developer's machine, or a test
 * runner standing in for one.
 */
export const NON_DEPLOYED_TARGET_ENVS: readonly string[] = [
  'local',
  'test',
  'e2e',
  'ci',
];

/**
 * Is this process part of a real deployment?
 *
 * **An unset value reads as not deployed.** That is deliberate and it is what
 * five of the seven original call sites did: a fresh clone has nothing set,
 * and `npm run dev` must not start demanding production credentials or
 * warning about local file storage.
 *
 * Two call sites need the opposite reading, because for them an unset value
 * is the dangerous case rather than the ordinary one — `getBaseUrl()` would
 * otherwise mail out `localhost` links from a real deployment. They check for
 * `undefined` themselves, next to a comment saying why. The value of this
 * function is that the *list* lives once; how a caller treats a missing value
 * is a policy that genuinely differs between them.
 */
export function isDeployedEnv(targetEnv: string | undefined): boolean {
  if (targetEnv === undefined) {
    return false;
  }

  const trimmed = targetEnv.trim();
  if (trimmed === '') {
    return false;
  }

  return !NON_DEPLOYED_TARGET_ENVS.includes(trimmed);
}
