import {
  AI_USAGE_SUM_FIELDS,
  toAiUsageTotals,
} from '@ragenai/platform-contracts';

import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { SearchableSelect } from '@/app/components/SearchableSelect';
import { SortableHeader } from '@/app/components/SortableHeader';
import { Pagination } from '@/app/components/Pagination';
import { DateFilter } from '@/app/components/DateFilter';
import { ExportButton } from '@/app/components/ExportButton';

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
  'createdAt' | 'totalTokens' | 'estimatedCost' | 'model' | 'provider';
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

  const apiWhere: Record<string, unknown> = {
    ...where,
    step: 'CHAT_COMPLETION',
    metadata: { path: ['source'], equals: 'API' },
  };

  const [records, total, summary, apiRequestCount, organizations] =
    await Promise.all([
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
        // Shared selection: a surface that omits one of these renders a blank
        // cell rather than failing (ADR-35).
        _sum: AI_USAGE_SUM_FIELDS,
        _count: true,
      }),
      prisma.aiUsage.count({ where: apiWhere }),
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
    // Null-coalesced once here rather than at each cell: Prisma returns
    // `null` for every `_sum` when nothing matched, and four separate `?? 0`
    // in the template is four chances to miss one.
    totals: toAiUsageTotals(summary),
    apiRequestCount,
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
  const {
    records,
    total,
    page,
    totalPages,
    totals,
    apiRequestCount,
    days,
    organizations,
  } = await getAiUsage(params);

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
        <div className="flex items-center gap-3">
          <DateFilter
            days={days}
            baseUrl={BASE_URL}
            extraParams={{ orgId: params.orgId }}
          />
          <ExportButton dataset="ai-usage" extraParams={extraParams} />
        </div>
      </div>

      <form className="flex flex-wrap gap-2">
        <SearchableSelect
          name="orgId"
          value={params.orgId}
          placeholder="All organizations"
          options={organizations.map((org) => ({
            value: org.id,
            label: org.name,
          }))}
          className="w-56"
        />
        <input type="hidden" name="days" value={days} />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filter
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Total Requests</p>
          <p className="mt-2 text-3xl font-bold">
            {totals.requests.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">API Requests</p>
          <p className="mt-2 text-3xl font-bold">
            {apiRequestCount.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Input Tokens</p>
          <p className="mt-2 text-3xl font-bold">
            {totals.inputTokens.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Output Tokens</p>
          <p className="mt-2 text-3xl font-bold">
            {totals.outputTokens.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Estimated Cost</p>
          <p className="mt-2 text-3xl font-bold">
            €{totals.estimatedCost.toFixed(2)}
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
                  {formatDateTime(record.createdAt)}
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
                  €{record.estimatedCost.toFixed(4)}
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
