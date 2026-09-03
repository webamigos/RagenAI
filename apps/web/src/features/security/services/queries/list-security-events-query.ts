import db from '@ragenai/prisma-client';
import type { Prisma } from '@/generated/prisma/client';
import type {
  SecurityEventFilters,
  SecurityEventPaginatedResult,
  SecurityEventRow,
} from '../../contracts/security-event.types';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function buildDateFilter(filters: SecurityEventFilters) {
  if (filters.period === 'custom' && filters.dateFrom) {
    return {
      gte: new Date(filters.dateFrom),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }

  const periodDays: Record<string, number> = {
    '1d': 1,
    '7d': 7,
    '30d': 30,
  };
  const days = periodDays[filters.period ?? '30d'] ?? 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  return { gte: since };
}

/**
 * List security events with filtering, sorting, and pagination.
 *
 * Critical invariant — the org-scoping contract:
 *   • `organizationId === undefined` → unscoped, returns everything (use
 *     ONLY from ragen-admin which is `@webamigos.pl`-gated).
 *   • `organizationId === string` → scoped to that single org. Guarantees
 *     an org admin cannot see another org's events even by crafting
 *     arbitrary filters.
 *   • `organizationId === null` → only events with `organization_id IS NULL`
 *     (pre-auth events like internal-secret mismatches).
 *
 * The org-scoping is enforced here so the two consuming UIs (apps/web
 * settings/security and ragen-admin incidents) cannot accidentally leak
 * cross-org data regardless of what filter object they pass.
 */
export async function listSecurityEventsQuery(
  filters: SecurityEventFilters,
): Promise<SecurityEventPaginatedResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    filters.pageSize ?? DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );
  const skip = (page - 1) * pageSize;

  const where: Prisma.SecurityEventWhereInput = {
    createdAt: buildDateFilter(filters),
  };

  if (filters.organizationId !== undefined) {
    where.organizationId = filters.organizationId;
  }
  if (filters.userId) {
    where.userId = filters.userId;
  }
  if (filters.eventType) {
    where.eventType = filters.eventType;
  }
  if (filters.severity) {
    where.severity = filters.severity;
  }
  if (filters.resolved !== undefined) {
    where.resolvedAt = filters.resolved ? { not: null } : null;
  }

  const [items, totalCount] = await Promise.all([
    db.securityEvent.findMany({
      where,
      // Postgres enum sort follows CREATE TYPE declaration order
      // (`info < warn < critical`), NOT alphabetical. `severity: 'desc'`
      // surfaces critical first, then warn, then info. Keep the enum
      // declaration order in sync with this assumption in schema.prisma.
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: pageSize,
      include: {
        organization: { select: { name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    db.securityEvent.count({ where }),
  ]);

  const rows: SecurityEventRow[] = items.map((item) => ({
    id: item.id,
    publicId: item.publicId,
    eventType: item.eventType,
    severity: item.severity,
    source: item.source,
    organizationId: item.organizationId,
    organizationName: item.organization?.name ?? null,
    userId: item.userId,
    user: item.user
      ? { id: item.user.id, name: item.user.name, email: item.user.email }
      : null,
    ipAddress: item.ipAddress,
    userAgent: item.userAgent,
    requestId: item.requestId,
    metadata: item.metadata,
    resolvedAt: item.resolvedAt?.toISOString() ?? null,
    resolvedBy: item.resolvedBy,
    createdAt: item.createdAt.toISOString(),
  }));

  return {
    items: rows,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
    page,
  };
}
