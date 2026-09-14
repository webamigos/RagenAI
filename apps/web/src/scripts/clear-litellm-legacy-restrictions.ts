/* eslint-disable no-console */
/**
 * Clear the budgets and model allowlists this application used to push to the
 * LiteLLM proxy.
 *
 * The application enforces both itself now and no longer syncs them, so every
 * value the proxy was last told is frozen. That is not merely stale, it is
 * still enforced: an administrator who raises an organization's ceiling gets
 * the higher one from the application and the old, lower one from the proxy —
 * and because the proxy's budget rejection is mapped to this application's own
 * "usage limit" message, the refusal reads as the panel's own, quoting a limit
 * the panel says was raised.
 *
 * The commands clear these on every write from now on, so a team that is ever
 * updated repairs itself. This is for the ones nobody touches again, and for
 * the **organization-level** teams, which are keyed by organization id and have
 * no `Team` row behind them.
 *
 * Usage:
 *   npx dotenvx run --env-file=.env.local -- npx tsx \
 *     src/scripts/clear-litellm-legacy-restrictions.ts --dry-run
 *   npx dotenvx run --env-file=.env.local -- npx tsx \
 *     src/scripts/clear-litellm-legacy-restrictions.ts --apply
 *
 * Safe to re-run: clearing an already-cleared team is a no-op. A team the
 * proxy does not know is reported and skipped rather than created — this
 * script's job is to remove enforcement, never to add any.
 */
import db from '@ragenai/prisma-client';
import { getLiteLLMTeamInfo, updateLiteLLMTeam } from '@/libs/litellm/client';

type Target = { id: string; label: string };

async function collectTargets(): Promise<Target[]> {
  const [orgs, teams] = await Promise.all([
    db.organization.findMany({ select: { id: true, name: true } }),
    db.team.findMany({
      where: { litellmTeamId: { not: null } },
      select: { litellmTeamId: true, name: true, organizationId: true },
    }),
  ]);

  return [
    // Signup creates one keyed by the organization id itself.
    ...orgs.map((org) => ({ id: org.id, label: `org ${org.name}` })),
    ...teams.map((team) => ({
      id: team.litellmTeamId as string,
      label: `team ${team.name} (${team.organizationId})`,
    })),
  ];
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (!apply && !process.argv.includes('--dry-run')) {
    console.error('Pass --dry-run or --apply.');
    process.exitCode = 1;
    return;
  }

  if (!process.env.LITELLM_PROXY_URL) {
    console.error('LITELLM_PROXY_URL is not set — nothing to clear.');
    process.exitCode = 1;
    return;
  }

  const targets = await collectTargets();
  console.log(`${targets.length} proxy teams to inspect\n`);

  let cleared = 0;
  let alreadyClear = 0;
  let unknown = 0;
  const failures: string[] = [];

  for (const target of targets) {
    const info = await getLiteLLMTeamInfo(target.id).catch(() => null);
    if (!info) {
      console.log(`  skip     ${target.label} — not known to the proxy`);
      unknown++;
      continue;
    }

    const carries =
      info.max_budget != null ||
      info.budget_duration != null ||
      (info.models?.length ?? 0) > 0;

    if (!carries) {
      alreadyClear++;
      continue;
    }

    console.log(
      `  clear    ${target.label} — budget ${info.max_budget ?? '—'}, ` +
        `models ${info.models?.length ?? 0}`,
    );

    if (!apply) {
      continue;
    }

    try {
      await updateLiteLLMTeam({
        teamId: target.id,
        maxBudget: null,
        budgetDuration: null,
        models: [],
      });
      cleared++;
    } catch (error) {
      failures.push(
        `${target.label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(
    `\n${apply ? 'cleared' : 'would clear'}: ${apply ? cleared : targets.length - alreadyClear - unknown}` +
      `, already clear: ${alreadyClear}, unknown to the proxy: ${unknown}`,
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} failed:`);
    for (const failure of failures) {
      console.error(`  ${failure}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
