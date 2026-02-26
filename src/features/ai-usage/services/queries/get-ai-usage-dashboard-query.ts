import db from '@ragenai/prisma-client';
import type { Prisma } from '@/generated/prisma/client';
import type {
  AiUsageFilters,
  AiUsageDashboardData,
  AiUsageListItem,
  AiUsageSummary,
  AiUsageChartData,
  AiUsageDailyDataPoint,
  AiUsageByStepDataPoint,
  AiUsageByModelDataPoint,
  AiUsageByOrgDataPoint,
} from '../../contracts/ai-usage.types';

function buildDateFilter(filters?: AiUsageFilters): Date | undefined {
  if (!filters?.period || filters.period === 'custom') return undefined;

  const now = new Date();
  const days: Record<string, number> = {
    '1d': 1,
    '7d': 7,
    '14d': 14,
    '30d': 30,
    '365d': 365,
  };
  const d = days[filters.period];
  if (!d) return undefined;

  return new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
}

function buildWhereClause(filters?: AiUsageFilters): Prisma.AiUsageWhereInput {
  const where: Prisma.AiUsageWhereInput = {};

  if (filters?.organizationId) {
    where.organization_id = filters.organizationId;
  }

  if (filters?.projectPublicId) {
    where.project = { public_id: filters.projectPublicId };
  }

  if (filters?.step) {
    where.step = filters.step;
  }

  const dateFrom = buildDateFilter(filters);
  if (dateFrom) {
    where.created_at = { gte: dateFrom };
  } else if (filters?.period === 'custom') {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.dateFrom) createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      createdAt.lte = endDate;
    }
    if (Object.keys(createdAt).length > 0) where.created_at = createdAt;
  }

  return where;
}

export async function getAiUsageDashboardQuery(
  filters?: AiUsageFilters,
): Promise<AiUsageDashboardData> {
  const where = buildWhereClause(filters);

  const [items, aggregates] = await Promise.all([
    db.aiUsage.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 500,
      include: {
        organization: {
          select: {
            provider_id: true,
          },
        },
        project: {
          select: { public_id: true, title: true },
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
        input_tokens: true,
        output_tokens: true,
        total_tokens: true,
        estimated_cost: true,
      },
    }),
  ]);

  // Fetch org names for all org IDs in the result set
  const orgIds = [...new Set(items.map((i) => i.organization_id))];
  const orgNames = await getOrgNameMap(orgIds);

  const summary: AiUsageSummary = {
    totalCalls: aggregates._count,
    totalTokens: aggregates._sum.total_tokens ?? 0,
    totalInputTokens: aggregates._sum.input_tokens ?? 0,
    totalOutputTokens: aggregates._sum.output_tokens ?? 0,
    totalCost: aggregates._sum.estimated_cost ?? 0,
  };

  const mappedItems: AiUsageListItem[] = items.map((item) => ({
    publicId: item.public_id,
    step: item.step,
    provider: item.provider,
    model: item.model,
    inputTokens: item.input_tokens,
    outputTokens: item.output_tokens,
    totalTokens: item.total_tokens,
    estimatedCost: item.estimated_cost,
    durationMs: item.duration_ms,
    createdAt: item.created_at,
    organizationName:
      orgNames.get(item.organization_id) ?? item.organization_id,
    organizationId: item.organization_id,
    project: item.project
      ? { publicId: item.project.public_id, title: item.project.title }
      : null,
    user: item.user
      ? { id: item.user.id, name: item.user.name, email: item.user.email }
      : null,
  }));

  const charts = buildChartData(mappedItems);

  return { summary, items: mappedItems, charts };
}

async function getOrgNameMap(
  orgProviderIds: string[],
): Promise<Map<string, string>> {
  if (orgProviderIds.length === 0) return new Map();

  const orgs = await db.organization.findMany({
    where: { id: { in: orgProviderIds } },
    select: { id: true, name: true },
  });

  return new Map(orgs.map((o) => [o.id, o.name]));
}

function buildChartData(items: AiUsageListItem[]): AiUsageChartData {
  // Daily aggregation
  const dailyMap = new Map<string, AiUsageDailyDataPoint>();
  const stepMap = new Map<string, AiUsageByStepDataPoint>();
  const modelMap = new Map<string, AiUsageByModelDataPoint>();
  const orgMap = new Map<string, AiUsageByOrgDataPoint>();

  for (const item of items) {
    // Daily
    const dateKey = item.createdAt.toISOString().split('T')[0]!;
    const daily = dailyMap.get(dateKey) ?? {
      date: dateKey,
      calls: 0,
      tokens: 0,
      cost: 0,
    };
    daily.calls++;
    daily.tokens += item.totalTokens;
    daily.cost += item.estimatedCost;
    dailyMap.set(dateKey, daily);

    // By step
    const step = stepMap.get(item.step) ?? {
      step: item.step,
      calls: 0,
      tokens: 0,
      cost: 0,
    };
    step.calls++;
    step.tokens += item.totalTokens;
    step.cost += item.estimatedCost;
    stepMap.set(item.step, step);

    // By model
    const model = modelMap.get(item.model) ?? {
      model: item.model,
      calls: 0,
      tokens: 0,
      cost: 0,
    };
    model.calls++;
    model.tokens += item.totalTokens;
    model.cost += item.estimatedCost;
    modelMap.set(item.model, model);

    // By org
    const org = orgMap.get(item.organizationName) ?? {
      organizationName: item.organizationName,
      calls: 0,
      tokens: 0,
      cost: 0,
    };
    org.calls++;
    org.tokens += item.totalTokens;
    org.cost += item.estimatedCost;
    orgMap.set(item.organizationName, org);
  }

  return {
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byStep: [...stepMap.values()].sort((a, b) => b.cost - a.cost),
    byModel: [...modelMap.values()].sort((a, b) => b.cost - a.cost),
    byOrg: [...orgMap.values()].sort((a, b) => b.cost - a.cost),
  };
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

export async function getProjectsForFilterQuery(
  orgId?: string,
): Promise<{ publicId: string; title: string; orgName: string }[]> {
  const where: Prisma.ProjectWhereInput = {};
  if (orgId) {
    where.organization_id = orgId;
  }

  const projects = await db.project.findMany({
    where,
    select: {
      public_id: true,
      title: true,
      organization_id: true,
    },
    orderBy: { title: 'asc' },
  });

  // Resolve org names from the Better Auth Organization table
  const orgIds = [
    ...new Set(projects.map((p) => p.organization_id).filter(Boolean)),
  ] as string[];
  const orgNameMap = await getOrgNameMap(orgIds);

  return projects.map((p) => ({
    publicId: p.public_id,
    title: p.title,
    orgName: p.organization_id ? (orgNameMap.get(p.organization_id) ?? '') : '',
  }));
}
