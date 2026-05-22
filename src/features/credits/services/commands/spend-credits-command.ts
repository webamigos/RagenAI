import db from '@ragenai/prisma-client';
import { CreditLedgerReason, type Prisma } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import type {
  SpendCreditsInput,
  SpendCreditsResult,
} from '../../contracts/credits.types';

/**
 * Atomically spend credits. Uses SELECT FOR UPDATE to serialize concurrent
 * spends per organization. When `idempotencyKey` is provided and a ledger
 * entry already exists for it, returns the prior result without double-charging.
 */
export async function spendCreditsCommand(
  input: SpendCreditsInput,
): Promise<SpendCreditsResult> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('spendCreditsCommand: amount must be a positive integer');
  }

  return db.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.creditLedgerEntry.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        return {
          ok: true as const,
          balance: existing.balanceAfter,
          ledgerPublicId: existing.publicId,
          deduplicated: true,
        };
      }
    }

    // Lock the balance row (or create a zero row to lock against).
    await tx.$executeRaw`
      INSERT INTO "org_credit_balances" ("organization_id", "balance", "lifetime_granted", "lifetime_spent", "updated_at")
      VALUES (${input.organizationId}, 0, 0, 0, CURRENT_TIMESTAMP)
      ON CONFLICT ("organization_id") DO NOTHING
    `;
    const locked = await tx.$queryRaw<
      { balance: number; lifetime_spent: number }[]
    >`
      SELECT "balance", "lifetime_spent"
      FROM "org_credit_balances"
      WHERE "organization_id" = ${input.organizationId}
      FOR UPDATE
    `;
    const current = locked[0];
    if (!current) {
      throw new Error('Failed to lock credit balance row');
    }

    if (current.balance < input.amount) {
      return {
        ok: false as const,
        reason: 'insufficient',
        balance: current.balance,
        required: input.amount,
      };
    }

    const newBalance = current.balance - input.amount;
    await tx.orgCreditBalance.update({
      where: { organizationId: input.organizationId },
      data: {
        balance: newBalance,
        lifetimeSpent: current.lifetime_spent + input.amount,
      },
    });

    const entry = await tx.creditLedgerEntry.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        delta: -input.amount,
        balanceAfter: newBalance,
        reason: CreditLedgerReason.SPEND,
        operation: input.operation,
        referenceId: input.referenceId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        metadata:
          (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });

    logger.info(
      {
        organizationId: input.organizationId,
        operation: input.operation,
        amount: input.amount,
        balanceAfter: newBalance,
      },
      'Credits spent',
    );

    return {
      ok: true as const,
      balance: newBalance,
      ledgerPublicId: entry.publicId,
      deduplicated: false,
    };
  });
}
