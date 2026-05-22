/* eslint-disable no-console */
/**
 * Backfill: grant trial credits to every existing organization that has no
 * credit balance row yet. Mirrors the per-org `grantCreditsCommand` logic
 * (additive, idempotency-keyed by orgId) so a second run is a no-op.
 *
 * Usage:
 *   npx dotenvx run --env-file=.env.local -- npx tsx \
 *     src/scripts/backfill-trial-credits.ts
 *
 * Options (via env):
 *   AMOUNT=500          Trial credit amount (default 500)
 *   DRY_RUN=1           Print actions without writing
 *
 * Idempotent: each grant uses idempotency key `trial:{orgId}` — the same key
 * used by the Better Auth + onboarding hooks. Orgs created after this point
 * will get their trial via those hooks; this script is for backfilling orgs
 * that pre-date the credits feature.
 */
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const AMOUNT = Number(process.env.AMOUNT ?? '500');
const DRY_RUN = process.env.DRY_RUN === '1';

async function main() {
  if (!Number.isInteger(AMOUNT) || AMOUNT <= 0) {
    throw new Error(`Invalid AMOUNT=${process.env.AMOUNT}`);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL');
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const db = new PrismaClient({ adapter });

  console.log(`[backfill-trial-credits] amount=${AMOUNT} dryRun=${DRY_RUN}`);

  const orgs = await db.organization.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`[backfill-trial-credits] scanning ${orgs.length} orgs`);

  let granted = 0;
  let skipped = 0;
  let failed = 0;

  for (const org of orgs) {
    const idempotencyKey = `trial:${org.id}`;
    try {
      const existing = await db.creditLedgerEntry.findFirst({
        where: { organizationId: org.id, idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(
          `[dry-run] would grant ${AMOUNT} to ${org.id} (${org.name})`,
        );
        granted++;
        continue;
      }

      await db.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO "org_credit_balances" ("organization_id", "balance", "lifetime_granted", "lifetime_spent", "updated_at")
          VALUES (${org.id}, 0, 0, 0, CURRENT_TIMESTAMP)
          ON CONFLICT ("organization_id") DO NOTHING
        `;
        const locked = await tx.$queryRaw<
          { balance: number; lifetime_granted: number }[]
        >`
          SELECT "balance", "lifetime_granted"
          FROM "org_credit_balances"
          WHERE "organization_id" = ${org.id}
          FOR UPDATE
        `;
        const current = locked[0];
        if (!current) {
          throw new Error('Failed to lock credit balance row');
        }
        const newBalance = current.balance + AMOUNT;
        await tx.orgCreditBalance.update({
          where: { organizationId: org.id },
          data: {
            balance: newBalance,
            lifetimeGranted: current.lifetime_granted + AMOUNT,
          },
        });
        await tx.creditLedgerEntry.create({
          data: {
            organizationId: org.id,
            delta: AMOUNT,
            balanceAfter: newBalance,
            reason: 'GRANT_TRIAL',
            idempotencyKey,
            note: 'Backfill: pre-existing org trial grant',
          },
        });
      });
      granted++;
      console.log(`[granted] ${AMOUNT} credits → ${org.id} (${org.name})`);
    } catch (err) {
      failed++;
      console.error(
        `[failed] ${org.id} (${org.name}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `[backfill-trial-credits] done — granted=${granted} skipped=${skipped} failed=${failed}`,
  );
  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[backfill-trial-credits] fatal:', err);
  process.exit(1);
});
