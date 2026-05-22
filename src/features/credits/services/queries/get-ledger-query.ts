import db from '@ragenai/prisma-client';
import type { CreditLedgerEntryView } from '../../contracts/credits.types';

export async function getLedgerQuery(
  organizationId: string,
  limit = 50,
): Promise<CreditLedgerEntryView[]> {
  const rows = await db.creditLedgerEntry.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({
    publicId: r.publicId,
    organizationId: r.organizationId,
    userId: r.userId,
    delta: r.delta,
    balanceAfter: r.balanceAfter,
    reason: r.reason,
    operation: r.operation,
    referenceId: r.referenceId,
    idempotencyKey: r.idempotencyKey,
    note: r.note,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt,
  }));
}
