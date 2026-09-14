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
  let unreadable = 0;
  const failures: string[] = [];

  for (const target of targets) {
    /**
     * `--apply` does not consult the read at all, and that is the point.
     *
     * `getLiteLLMTeamInfo` returns null for a 404 *and* for a network or
     * parse failure — the client flattens both — while a non-404 HTTP error
     * rejects. A `.catch(() => null)` around it, which is what this used to
     * do, turns every one of those into "no team here", and the loop then
     * skips a team whose restrictions are still live while the script exits 0.
     *
     * So the write is what has to succeed. A 404 from `/team/update` means the
     * proxy has no such team, which is the one skip worth making; anything
     * else is recorded and makes the run fail.
     */
    if (apply) {
      try {
        await updateLiteLLMTeam({
          teamId: target.id,
          maxBudget: null,
          budgetDuration: null,
          models: [],
        });
        cleared++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/\b404\b/.test(message)) {
          console.log(`  skip     ${target.label} — not known to the proxy`);
          unknown++;
        } else {
          failures.push(`${target.label}: ${message}`);
        }
      }
      continue;
    }

    // --dry-run only: report what is there. A failure here is reported as a
    // failure rather than as an absence, for the same reason.
    let info;
    try {
      info = await getLiteLLMTeamInfo(target.id);
    } catch (error) {
      console.log(
        `  ERROR    ${target.label} — could not read: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      unreadable++;
      continue;
    }

    if (!info) {
      console.log(
        `  skip     ${target.label} — not known to the proxy, or unreadable ` +
          `(the client reports a network failure the same way)`,
      );
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
  }

  console.log(
    apply
      ? `\ncleared: ${cleared}, not known to the proxy: ${unknown}`
      : `\nalready clear: ${alreadyClear}, not known to the proxy: ${unknown}` +
          `, unreadable: ${unreadable}`,
  );

  if (!apply && unreadable > 0) {
    console.error(
      `\n${unreadable} team(s) could not be read. Re-run --dry-run before ` +
        `--apply, or accept that those are unaccounted for.`,
    );
    process.exitCode = 1;
  }

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
