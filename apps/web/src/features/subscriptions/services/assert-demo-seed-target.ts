import { normalizeTargetEnv } from '@ragenai/env';

/**
 * Refuse to seed anything but the demo environment.
 *
 * `seed-demo-organization.ts` builds its Prisma client straight from
 * `process.env.DATABASE_URL` and finds its target by slug. Nothing else stops
 * it: `@ragenai/env` validates that a database URL is *syntactically* a URL,
 * not which database it points at. So a stale `DATABASE_URL` in the shell plus
 * an organization whose slug happens to be `demo` is all it takes to apply the
 * showcase restrictions — `manageDocuments: false`, `inviteMembers: false`, a
 * 50 EUR spend cap — to a paying customer's organization. It would look like it
 * worked.
 *
 * `TARGET_ENV` is the right thing to check because it is the one variable that
 * describes *which deployment this is* rather than which resource to reach, so
 * it cannot be right while the database URL is wrong for the same reason a
 * hostname cannot: they are set together or not at all.
 *
 * Unset counts as "not demo". A guard that passes when a variable is missing
 * is the shape of guard this repository has already been bitten by twice — see
 * `docs/lessons/a-secret-guarded-ci-step-fails-open.md` and
 * `docs/lessons/path-filters-fail-open-after-a-directory-move.md`.
 *
 * Lives here rather than beside the script because `apps/web/tsconfig.json`
 * excludes `src/scripts` — nothing in there is typechecked, so a guard written
 * there could reference a renamed export and still ship.
 */
export const DEMO_SEED_OVERRIDE_FLAG = '--not-really-demo';

export type DemoSeedTargetDecision = {
  /** True when the override was used, so the caller can say so loudly. */
  overridden: boolean;
  /** What `TARGET_ENV` actually said, for the log line. */
  targetEnv: string;
};

export function assertDemoSeedTarget(input: {
  targetEnv: string | undefined;
  argv: readonly string[];
}): DemoSeedTargetDecision {
  const targetEnv = normalizeTargetEnv(input.targetEnv) ?? '(unset)';

  if (targetEnv === 'demo') {
    return { overridden: false, targetEnv };
  }

  if (input.argv.includes(DEMO_SEED_OVERRIDE_FLAG)) {
    return { overridden: true, targetEnv };
  }

  throw new Error(
    `Refusing to seed: TARGET_ENV is ${targetEnv}, not "demo".\n\n` +
      `This script applies the demo organization's restrictions — documents, ` +
      `projects and settings frozen, invites and API access off, a spend cap — ` +
      `and it finds its target by slug in whatever database DATABASE_URL ` +
      `names. Against the wrong database that silently freezes a real ` +
      `organization.\n\n` +
      `Run it with TARGET_ENV=demo, or pass ${DEMO_SEED_OVERRIDE_FLAG} if ` +
      `seeding a non-demo environment is genuinely what you mean.`,
  );
}
