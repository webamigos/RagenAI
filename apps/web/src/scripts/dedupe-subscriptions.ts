/* eslint-disable no-console */
/**
 * Deduplicate Subscription rows: keep the "best" row per organization
 * (referenceId) and mark the others as `superseded` (a non-standard status
 * we treat as inactive). Stripe-managed subscriptions are NEVER touched —
 * any row with a stripeSubscriptionId is preserved as-is.
 *
 * Usage:
 *   npx dotenvx run --env-file=.env.local -- npx tsx \
 *     src/scripts/dedupe-subscriptions.ts --dry-run
 *   npx dotenvx run --env-file=.env.local -- npx tsx \
 *     src/scripts/dedupe-subscriptions.ts --apply
 *
 * Idempotent: re-runs only act on rows that still look like duplicates.
 *
 * Self-contained: imports the generated Prisma client directly (same
 * pattern as backfill-teams-for-orgs.ts) so it doesn't pull webpack-only
 * modules under tsx.
 */
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const TRIAL_PLAN_NAME = 'Trial';
const PLAN_TIER: Record<string, number> = { [TRIAL_PLAN_NAME]: 0 };

type Row = {
  id: string;
  plan: string;
  status: string;
  periodStart: Date | null;
  referenceId: string;
  stripeSubscriptionId: string | null;
};

function planRank(plan: string): number {
  return PLAN_TIER[plan] ?? 1;
}

function score(row: Row): number {
  let s = 0;
  if (row.status === 'active') {
    s += 4_000_000_000;
  } else if (row.status === 'trialing') {
    s += 2_000_000_000;
  }
  s += planRank(row.plan) * 1_000_000_000;
  // Stripe-managed rows always preferred — never demote a real paid plan.
  if (row.stripeSubscriptionId) {
    s += 100_000_000_000;
  }
  if (row.periodStart) {
    s += Math.floor(row.periodStart.getTime() / 1000);
  }
  return s;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const dryRun = !apply || args.has('--dry-run');

  const connectionString =
    process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_DIRECT_URL must be set');
  }
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);

  const rows: Row[] = await prisma.subscription.findMany({
    select: {
      id: true,
      plan: true,
      status: true,
      periodStart: true,
      referenceId: true,
      stripeSubscriptionId: true,
    },
  });

  const byRef = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byRef.get(r.referenceId) ?? [];
    list.push(r);
    byRef.set(r.referenceId, list);
  }

  let totalDupes = 0;
  const toSupersede: string[] = [];

  for (const [refId, list] of byRef) {
    if (list.length <= 1) {
      continue;
    }
    const sorted = [...list].sort((a, b) => score(b) - score(a));
    const winner = sorted[0];
    const losers = sorted
      .slice(1)
      .filter((r) => r.status !== 'canceled' && r.status !== 'superseded')
      // Never auto-supersede a Stripe-managed row.
      .filter((r) => !r.stripeSubscriptionId);

    if (losers.length === 0) {
      continue;
    }
    totalDupes += losers.length;
    console.log(
      `org ${refId}: keep ${winner.id} (${winner.status}/${winner.plan}), supersede ${losers.length} row(s):`,
    );
    for (const l of losers) {
      console.log(`  - ${l.id} (${l.status}/${l.plan})`);
      toSupersede.push(l.id);
    }
  }

  console.log(`\n${totalDupes} duplicate row(s) targeted.`);

  if (!dryRun && toSupersede.length > 0) {
    const result = await prisma.subscription.updateMany({
      where: { id: { in: toSupersede } },
      data: { status: 'superseded' },
    });
    console.log(`Updated ${result.count} row(s) to status='superseded'.`);
  } else if (dryRun) {
    console.log('Dry-run: no changes applied. Re-run with --apply to commit.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
