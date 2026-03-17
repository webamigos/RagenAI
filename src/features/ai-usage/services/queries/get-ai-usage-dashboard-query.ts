import db from '@ragenai/prisma-client';
import type { Prisma } from '@/generated/prisma/client';
import type {
  AiUsageFilters,
  AiUsageDashboardData,
  AiUsageListItem,
  AiUsageSummary,
  AiUsageChartData,
  AiUsageDailyDataPoint,
} from '../../contracts/ai-usage.types';

function buildDateFilter(filters?: AiUsageFilters): Date | undefined {
  if (!filters?.period || filters.period === 'custom') {
    return undefined;
  }

  const now = new Date();
  const days: Record<string, number> = {
    '1d': 1,
    '7d': 7,
    '14d': 14,
    '30d': 30,
    '365d': 365,
  };
  const d = days[filters.period];
  if (!d) {
    return undefined;
  }

  return new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
}

function buildWhereClause(filters?: AiUsageFilters): Prisma.AiUsageWhereInput {
  const where: Prisma.AiUsageWhereInput = {};

  if (filters?.organizationId) {
    where.organizationId = filters.organizationId;
  }

  if (filters?.projectPublicId) {
    where.project = { publicId: filters.projectPublicId };
  }

  if (filters?.userId) {
    where.userId = filters.userId;
  }

  if (filters?.step) {
    where.step = filters.step;
  }

  const dateFrom = buildDateFilter(filters);
  if (dateFrom) {
    where.createdAt = { gte: dateFrom };
  } else if (filters?.period === 'custom') {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.dateFrom) {
      createdAt.gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      createdAt.lte = endDate;
    }
    if (Object.keys(createdAt).length > 0) {
      where.createdAt = createdAt;
    }
  }

  return where;
}

export async function getAiUsageDashboardQuery(
  filters?: AiUsageFilters,
): Promise<AiUsageDashboardData> {
  const where = buildWhereClause(filters);

  const [items, aggregates, byStepRaw, byModelRaw, byOrgRaw, dailyData] =
    await Promise.all([
      db.aiUsage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: {
          project: {
            select: { publicId: true, title: true },
          },
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      db.aiUsage.aggregate({
        where,
        _count: true,
        _sum: {
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          estimatedCost: true,
        },
      }),
      db.aiUsage.groupBy({
        by: ['step'],
        where,
        _count: true,
        _sum: { totalTokens: true, estimatedCost: true },
      }),
      db.aiUsage.groupBy({
        by: ['model'],
        where,
        _count: true,
        _sum: { totalTokens: true, estimatedCost: true },
      }),
      db.aiUsage.groupBy({
        by: ['organizationId'],
        where,
        _count: true,
        _sum: { totalTokens: true, estimatedCost: true },
      }),
      getDailyChartData(filters),
    ]);

  // Collect all org IDs from items + chart data for name resolution
  const itemOrgIds = items.map((i) => i.organizationId);
  const chartOrgIds = byOrgRaw.map((r) => r.organizationId);
  const allOrgIds = [...new Set([...itemOrgIds, ...chartOrgIds])];
  const orgNames = await getOrgNameMap(allOrgIds);

  const summary: AiUsageSummary = {
    totalCalls: aggregates._count,
    totalTokens: aggregates._sum.totalTokens ?? 0,
    totalInputTokens: aggregates._sum.inputTokens ?? 0,
    totalOutputTokens: aggregates._sum.outputTokens ?? 0,
    totalCost: aggregates._sum.estimatedCost ?? 0,
  };

  const mappedItems: AiUsageListItem[] = items.map((item) => ({
    publicId: item.publicId,
    step: item.step,
    provider: item.provider,
    model: item.model,
    inputTokens: item.inputTokens,
    outputTokens: item.outputTokens,
    totalTokens: item.totalTokens,
    estimatedCost: item.estimatedCost,
    durationMs: item.durationMs,
    createdAt: item.createdAt,
    organizationName: orgNames.get(item.organizationId) ?? item.organizationId,
    organizationId: item.organizationId,
    project: item.project
      ? { publicId: item.project.publicId, title: item.project.title }
      : null,
    user: item.user
      ? { id: item.user.id, name: item.user.name, email: item.user.email }
      : null,
  }));

  const charts: AiUsageChartData = {
    daily: dailyData,
    byStep: byStepRaw
      .map((r) => ({
        step: r.step,
        calls: r._count,
        tokens: r._sum.totalTokens ?? 0,
        cost: r._sum.estimatedCost ?? 0,
      }))
      .sort((a, b) => b.cost - a.cost),
    byModel: byModelRaw
      .map((r) => ({
        model: r.model,
        calls: r._count,
        tokens: r._sum.totalTokens ?? 0,
        cost: r._sum.estimatedCost ?? 0,
      }))
      .sort((a, b) => b.cost - a.cost),
    byOrg: byOrgRaw
      .map((r) => ({
        organizationName: orgNames.get(r.organizationId) ?? r.organizationId,
        calls: r._count,
        tokens: r._sum.totalTokens ?? 0,
        cost: r._sum.estimatedCost ?? 0,
      }))
      .sort((a, b) => b.cost - a.cost),
  };

  return { summary, items: mappedItems, charts };
}

type DailyRawRow = {
  date: Date;
  calls: bigint;
  tokens: bigint;
  cost: number;
};

async function getDailyChartData(
  filters?: AiUsageFilters,
): Promise<AiUsageDailyDataPoint[]> {
  const conditions: string[] = ['TRUE'];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.organizationId) {
    conditions.push(`organization_id = $${idx++}`);
    params.push(filters.organizationId);
  }

  if (filters?.projectPublicId) {
    conditions.push(
      `project_id IN (SELECT id FROM projects WHERE public_id = $${idx++})`,
    );
    params.push(filters.projectPublicId);
  }

  if (filters?.userId) {
    conditions.push(`user_id = $${idx++}`);
    params.push(filters.userId);
  }

  if (filters?.step) {
    conditions.push(`step::text = $${idx++}`);
    params.push(filters.step);
  }

  const dateFrom = buildDateFilter(filters);
  if (dateFrom) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(dateFrom);
  } else if (filters?.period === 'custom') {
    if (filters.dateFrom) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(`created_at <= $${idx++}`);
      params.push(endDate);
    }
  }

  const rows = await db.$queryRawUnsafe<DailyRawRow[]>(
    `SELECT
       DATE(created_at AT TIME ZONE 'UTC') AS date,
       COUNT(*)::bigint AS calls,
       COALESCE(SUM(total_tokens), 0)::bigint AS tokens,
       COALESCE(SUM(estimated_cost), 0)::float8 AS cost
     FROM ai_usages
     WHERE ${conditions.join(' AND ')}
     GROUP BY DATE(created_at AT TIME ZONE 'UTC')
     ORDER BY date ASC`,
    ...params,
  );

  return rows.map((r) => ({
    date:
      r.date instanceof Date
        ? r.date.toISOString().split('T')[0]!
        : String(r.date),
    calls: Number(r.calls),
    tokens: Number(r.tokens),
    cost: r.cost,
  }));
}

async function getOrgNameMap(orgIds: string[]): Promise<Map<string, string>> {
  if (orgIds.length === 0) {
    return new Map();
  }

  const orgs = await db.organization.findMany({
    where: { id: { in: orgIds } },
    select: { id: true, name: true },
  });

  return new Map(orgs.map((o) => [o.id, o.name]));
}

export async function getOrganizationsForFilterQuery(): Promise<
  { id: string; name: string }[]
> {
  const orgs = await db.organization.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return orgs;
}

export async function getUsersForFilterQuery(
  orgId?: string,
): Promise<{ id: string; name: string | null; email: string }[]> {
  const where: Prisma.AiUsageWhereInput = {};
  if (orgId) {
    where.organizationId = orgId;
  }

  const usageRecords = await db.aiUsage.findMany({
    where: { ...where, userId: { not: null } },
    select: { userId: true },
    distinct: ['userId'],
  });

  const userIds = usageRecords
    .map((r) => r.userId)
    .filter((id): id is string => id != null);

  if (userIds.length === 0) {
    return [];
  }

  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
    orderBy: { email: 'asc' },
  });

  return users;
}

export async function getProjectsForFilterQuery(
  orgId?: string,
): Promise<{ publicId: string; title: string; orgName: string }[]> {
  const where: Prisma.ProjectWhereInput = {};
  if (orgId) {
    where.organizationId = orgId;
  }

  const projects = await db.project.findMany({
    where,
    select: {
      publicId: true,
      title: true,
      organizationId: true,
    },
    orderBy: { title: 'asc' },
  });

  // Resolve org names from the Better Auth Organization table
  const orgIds = [
    ...new Set(projects.map((p) => p.organizationId).filter(Boolean)),
  ] as string[];
  const orgNameMap = await getOrgNameMap(orgIds);

  return projects.map((p) => ({
    publicId: p.publicId,
    title: p.title,
    orgName: p.organizationId ? (orgNameMap.get(p.organizationId) ?? '') : '',
  }));
}
