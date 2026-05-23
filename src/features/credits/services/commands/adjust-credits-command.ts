import db from '@ragenai/prisma-client';
import { CreditLedgerReason, type Prisma } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';

export type AdjustCreditsInput = {
  organizationId: string;
  /** Signed change. Positive grants credits, negative deducts. */
  delta: number;
  actorUserId?: string;
  note?: string;
  metadata?: Record<string, unknown>;
};

export type AdjustCreditsResult = {
  balance: number;
  ledgerPublicId: string;
};

/**
 * Admin signed adjustment. Ledger reason is always GRANT_ADMIN. Balance is
 * floored at 0 — admins cannot drive an org into a negative balance.
 */
export async function adjustCreditsCommand(
  input: AdjustCreditsInput,
): Promise<AdjustCreditsResult> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new Error('adjustCreditsCommand: delta must be a non-zero integer');
  }

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "org_credit_balances" ("organization_id", "balance", "lifetime_granted", "lifetime_spent", "updated_at")
      VALUES (${input.organizationId}, 0, 0, 0, CURRENT_TIMESTAMP)
      ON CONFLICT ("organization_id") DO NOTHING
    `;
    const locked = await tx.$queryRaw<
      { balance: number; lifetime_granted: number; lifetime_spent: number }[]
    >`
      SELECT "balance", "lifetime_granted", "lifetime_spent"
      FROM "org_credit_balances"
      WHERE "organization_id" = ${input.organizationId}
      FOR UPDATE
    `;
    const current = locked[0];
    if (!current) {
      throw new Error('Failed to lock credit balance row');
    }

    const newBalance = Math.max(0, current.balance + input.delta);
    const effectiveDelta = newBalance - current.balance;
    const grantedAddition = Math.max(0, effectiveDelta);
    // Admin deductions count toward lifetimeSpent so the invariant
    // `balance == lifetimeGranted - lifetimeSpent` holds even after manual
    // reconciliations. The ledger entry still carries reason=GRANT_ADMIN so
    // they're distinguishable from operation-driven spend.
    const spentAddition = effectiveDelta < 0 ? -effectiveDelta : 0;

    await tx.orgCreditBalance.update({
      where: { organizationId: input.organizationId },
      data: {
        balance: newBalance,
        lifetimeGranted: current.lifetime_granted + grantedAddition,
        lifetimeSpent: current.lifetime_spent + spentAddition,
      },
    });

    const entry = await tx.creditLedgerEntry.create({
      data: {
        organizationId: input.organizationId,
        userId: input.actorUserId ?? null,
        delta: effectiveDelta,
        balanceAfter: newBalance,
        reason: CreditLedgerReason.GRANT_ADMIN,
        note: input.note ?? null,
        metadata:
          (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });

    logger.info(
      {
        organizationId: input.organizationId,
        delta: effectiveDelta,
        balanceAfter: newBalance,
        actorUserId: input.actorUserId,
      },
      'Credits adjusted by admin',
    );

    return { balance: newBalance, ledgerPublicId: entry.publicId };
  });
}
