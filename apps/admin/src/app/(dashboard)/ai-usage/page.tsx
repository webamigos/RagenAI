import { prisma } from '@/lib/db';
import { SortableHeader } from '@/app/components/SortableHeader';
import { Pagination } from '@/app/components/Pagination';
import { DateFilter } from '@/app/components/DateFilter';

export const dynamic = 'force-dynamic';

interface SearchParams {
  page?: string;
  days?: string;
  orgId?: string;
  sort?: string;
  order?: string;
}

const PAGE_SIZE = 50;
const BASE_URL = '/ai-usage';

type SortField =
  | 'createdAt'
  | 'totalTokens'
  | 'estimatedCost'
  | 'model'
  | 'provider';
const VALID_SORTS: SortField[] = [
  'createdAt',
  'totalTokens',
  'estimatedCost',
  'model',
  'provider',
];

async function getAiUsage(params: SearchParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const days = Math.max(1, Number(params.days) || 30);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const sortField = VALID_SORTS.includes(params.sort as SortField)
    ? (params.sort as SortField)
    : 'createdAt';
  const sortOrder = params.order === 'asc' ? 'asc' : 'desc';

  const where: Record<string, unknown> = {
    createdAt: { gte: since },
  };
  if (params.orgId) {
    where.organizationId = params.orgId;
  }

  const [records, total, summary, organizations] = await Promise.all([
    prisma.aiUsage.findMany({
      where,
      include: {
        organization: { select: { name: true } },
        user: { select: { name: true, email: true } },
      },
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.aiUsage.count({ where }),
    prisma.aiUsage.aggregate({
      where,
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        estimatedCost: true,
      },
      _count: true,
    }),
    prisma.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return {
    records,
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    summary,
    days,
    organizations,
  };
}

export default async function AiUsagePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { records, total, page, totalPages, summary, days, organizations } =
    await getAiUsage(params);

  const extraParams = {
    orgId: params.orgId,
    days: String(days),
    sort: params.sort,
    order: params.order,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">AI Usage</h1>
        <DateFilter
          days={days}
          baseUrl={BASE_URL}
          extraParams={{ orgId: params.orgId }}
        />
      </div>

      <form className="flex flex-wrap gap-2">
        <select
          name="orgId"
          defaultValue={params.orgId || ''}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All organizations</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <input type="hidden" name="days" value={days} />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filter
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Total Requests</p>
          <p className="mt-2 text-3xl font-bold">
            {summary._count.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Input Tokens</p>
          <p className="mt-2 text-3xl font-bold">
            {(summary._sum.inputTokens ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Output Tokens</p>
          <p className="mt-2 text-3xl font-bold">
            {(summary._sum.outputTokens ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Estimated Cost</p>
          <p className="mt-2 text-3xl font-bold">
            ${(summary._sum.estimatedCost ?? 0).toFixed(2)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <SortableHeader
                label="Date"
                field="createdAt"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <th className="px-4 py-3 text-left font-medium">Organization</th>
              <th className="px-4 py-3 text-left font-medium">User</th>
              <th className="px-4 py-3 text-left font-medium">Step</th>
              <SortableHeader
                label="Provider"
                field="provider"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <SortableHeader
                label="Model"
                field="model"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <SortableHeader
                label="Tokens"
                field="totalTokens"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-right"
              />
              <SortableHeader
                label="Cost"
                field="estimatedCost"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-right"
              />
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                key={record.id}
                className="border-b border-border last:border-0"
              >
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {new Date(record.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">{record.organization.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {record.user?.name || record.user?.email || '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                    {record.step}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {record.provider}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {record.model}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {record.totalTokens.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  ${record.estimatedCost.toFixed(4)}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No AI usage records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        baseUrl={BASE_URL}
        extraParams={extraParams}
      />
    </div>
  );
}
