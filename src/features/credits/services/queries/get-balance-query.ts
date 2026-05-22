import db from '@ragenai/prisma-client';
import type { CreditBalance } from '../../contracts/credits.types';
import { ensurePlanGrantCommand } from '../commands/ensure-plan-grant-command';

/**
 * Returns the org's current credit balance. Before reading, fires a lazy
 * monthly renewal check — if the org has an active subscription and the
 * current billing period hasn't been granted yet, one grant fires here.
 * Idempotent: repeat reads in the same period don't re-grant.
 */
export async function getBalanceQuery(
  organizationId: string,
): Promise<CreditBalance> {
  await ensurePlanGrantCommand(organizationId);
  const row = await db.orgCreditBalance.findUnique({
    where: { organizationId },
  });
  if (row) {
    return row;
  }
  return {
    organizationId,
    balance: 0,
    lifetimeGranted: 0,
    lifetimeSpent: 0,
    updatedAt: new Date(0),
  };
}
