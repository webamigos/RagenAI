'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

type AdjustResult = {
  balance: number;
  ledgerPublicId: string;
};

/**
 * Admin signed adjustment to an org's credit balance. Positive grants,
 * negative deducts. Balance is floored at 0. Atomic via SELECT FOR UPDATE
 * in a transaction so concurrent admin/scoring activity stays consistent.
 */
export async function adjustOrgCreditsAction(
  orgId: string,
  delta: number,
  note: string | null,
): Promise<AdjustResult> {
  if (!orgId?.trim()) {
    throw new Error('Invalid organization ID');
  }
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error('Delta must be a non-zero integer');
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  const actorUserId = session.user.id;

  // Credit adjustments are money-equivalent — gate on app-admin role even
  // though the dashboard layout already requires a session.
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { role: true },
  });
  if (actor?.role !== 'admin') {
    throw new Error('Forbidden: app admin role required');
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  if (!org) {
    throw new Error('Organization not found');
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "org_credit_balances" ("organization_id", "balance", "lifetime_granted", "lifetime_spent", "updated_at")
      VALUES (${orgId}, 0, 0, 0, CURRENT_TIMESTAMP)
      ON CONFLICT ("organization_id") DO NOTHING
    `;
    const locked = await tx.$queryRaw<
      { balance: number; lifetime_granted: number }[]
    >`
      SELECT "balance", "lifetime_granted"
      FROM "org_credit_balances"
      WHERE "organization_id" = ${orgId}
      FOR UPDATE
    `;
    const current = locked[0];
    if (!current) {
      throw new Error('Failed to lock credit balance row');
    }

    const newBalance = Math.max(0, current.balance + delta);
    const effectiveDelta = newBalance - current.balance;
    const grantedAddition = Math.max(0, effectiveDelta);

    await tx.orgCreditBalance.update({
      where: { organizationId: orgId },
      data: {
        balance: newBalance,
        lifetimeGranted: current.lifetime_granted + grantedAddition,
      },
    });

    const entry = await tx.creditLedgerEntry.create({
      data: {
        organizationId: orgId,
        userId: actorUserId,
        delta: effectiveDelta,
        balanceAfter: newBalance,
        reason: 'GRANT_ADMIN',
        note: note?.trim() || null,
      },
      select: { publicId: true },
    });

    return { balance: newBalance, ledgerPublicId: entry.publicId };
  });

  revalidatePath(`/organizations/${orgId}`);
  return result;
}
