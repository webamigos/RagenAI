import db from '@ragenai/prisma-client';
import type {
  AuditLogFilters,
  AuditLogPaginatedResult,
  AuditLogFilterOptions,
} from '../../contracts/audit-log.types';

const DEFAULT_PAGE_SIZE = 25;

function buildDateFilter(filters: AuditLogFilters) {
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

export async function getAuditLogsQuery(
  filters: AuditLogFilters,
): Promise<AuditLogPaginatedResult> {
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? DEFAULT_PAGE_SIZE, 100);
  const skip = (page - 1) * pageSize;

  const where = {
    createdAt: buildDateFilter(filters),
    ...(filters.organizationId
      ? { organizationId: filters.organizationId }
      : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.action ? { action: filters.action } : {}),
  };

  const [items, totalCount] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        organization: { select: { name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    db.auditLog.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      action: item.action,
      entityType: item.entityType,
      entityId: item.entityId,
      oldData: item.oldData,
      newData: item.newData,
      createdAt: item.createdAt.toISOString(),
      organizationName: item.organization.name,
      organizationId: item.organizationId,
      user: item.user,
    })),
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
    page,
  };
}

export async function getAuditLogFilterOptionsQuery(scope?: {
  organizationId: string;
}): Promise<AuditLogFilterOptions> {
  const entityTypeWhere = scope ? { organizationId: scope.organizationId } : {};

  const [entityTypes, actions, users, organizations] = await Promise.all([
    db.auditLog
      .findMany({
        where: entityTypeWhere,
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      })
      .then((rows) => rows.map((r) => r.entityType)),
    db.auditLog
      .findMany({
        where: entityTypeWhere,
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      })
      .then((rows) => rows.map((r) => r.action)),
    scope
      ? db.member
          .findMany({
            where: { organizationId: scope.organizationId },
            select: {
              user: { select: { id: true, name: true, email: true } },
            },
            orderBy: { user: { name: 'asc' } },
          })
          .then((rows) => rows.map((r) => r.user))
      : db.user.findMany({
          select: { id: true, name: true, email: true },
          orderBy: { name: 'asc' },
        }),
    scope
      ? db.organization.findMany({
          where: { id: scope.organizationId },
          select: { id: true, name: true },
        })
      : db.organization.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
  ]);

  return { entityTypes, actions, users, organizations };
}
