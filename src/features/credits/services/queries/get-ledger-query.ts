import db from '@ragenai/prisma-client';
import type { CreditLedgerEntryView } from '../../contracts/credits.types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function narrowMetadata(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export async function getLedgerQuery(
  organizationId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<CreditLedgerEntryView[]> {
  const safeLimit =
    Number.isInteger(limit) && limit > 0
      ? Math.min(limit, MAX_LIMIT)
      : DEFAULT_LIMIT;
  const rows = await db.creditLedgerEntry.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: safeLimit,
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
    metadata: narrowMetadata(r.metadata),
    createdAt: r.createdAt,
  }));
}
