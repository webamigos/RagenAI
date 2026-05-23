import db from '@ragenai/prisma-client';
import { CreditLedgerReason, type Prisma } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import type { GrantCreditsInput } from '../../contracts/credits.types';

/**
 * Atomically add credits to an org. `RESET` overwrites the balance (no
 * carry-over for monthly grants); other reasons add to the existing balance.
 */
export async function grantCreditsCommand(
  input: GrantCreditsInput,
): Promise<{ balance: number; ledgerPublicId: string; deduplicated: boolean }> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('grantCreditsCommand: amount must be a positive integer');
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
          balance: existing.balanceAfter,
          ledgerPublicId: existing.publicId,
          deduplicated: true,
        };
      }
    }

    await tx.$executeRaw`
      INSERT INTO "org_credit_balances" ("organization_id", "balance", "lifetime_granted", "lifetime_spent", "updated_at")
      VALUES (${input.organizationId}, 0, 0, 0, CURRENT_TIMESTAMP)
      ON CONFLICT ("organization_id") DO NOTHING
    `;
    const locked = await tx.$queryRaw<
      { balance: number; lifetime_granted: number }[]
    >`
      SELECT "balance", "lifetime_granted"
      FROM "org_credit_balances"
      WHERE "organization_id" = ${input.organizationId}
      FOR UPDATE
    `;
    const current = locked[0];
    if (!current) {
      throw new Error('Failed to lock credit balance row');
    }

    const isReset = input.reason === CreditLedgerReason.RESET;
    const newBalance = isReset ? input.amount : current.balance + input.amount;
    const delta = newBalance - current.balance;
    const grantedAddition = Math.max(0, delta);

    await tx.orgCreditBalance.update({
      where: { organizationId: input.organizationId },
      data: {
        balance: newBalance,
        lifetimeGranted: current.lifetime_granted + grantedAddition,
      },
    });

    let entry;
    try {
      entry = await tx.creditLedgerEntry.create({
        data: {
          organizationId: input.organizationId,
          userId: input.actorUserId ?? null,
          delta,
          balanceAfter: newBalance,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey ?? null,
          note: input.note ?? null,
          metadata:
            (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        },
      });
    } catch (err) {
      // P2002 (unique constraint) on (organizationId, idempotencyKey) means
      // a concurrent caller landed first between our findUnique pre-check
      // and the insert. Re-query and return the winner's result.
      if (
        input.idempotencyKey &&
        err instanceof Error &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        const winner = await tx.creditLedgerEntry.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: input.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (winner) {
          return {
            balance: winner.balanceAfter,
            ledgerPublicId: winner.publicId,
            deduplicated: true,
          };
        }
      }
      throw err;
    }

    logger.info(
      {
        organizationId: input.organizationId,
        reason: input.reason,
        delta,
        balanceAfter: newBalance,
      },
      'Credits granted',
    );

    return {
      balance: newBalance,
      ledgerPublicId: entry.publicId,
      deduplicated: false,
    };
  });
}
