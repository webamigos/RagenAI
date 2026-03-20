import { prisma } from '@/lib/db';
import { SortableHeader } from '@/app/components/SortableHeader';
import { Pagination } from '@/app/components/Pagination';
import { DateFilter } from '@/app/components/DateFilter';

export const dynamic = 'force-dynamic';

interface SearchParams {
  page?: string;
  action?: string;
  entityType?: string;
  search?: string;
  sort?: string;
  order?: string;
  days?: string;
  orgId?: string;
}

const PAGE_SIZE = 50;
const BASE_URL = '/activity-log';

type SortField = 'createdAt' | 'action' | 'entityType';
const VALID_SORTS: SortField[] = ['createdAt', 'action', 'entityType'];

async function getAuditLogs(params: SearchParams) {
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
  if (params.action) {
    where.action = params.action;
  }
  if (params.entityType) {
    where.entityType = params.entityType;
  }
  if (params.orgId) {
    where.organizationId = params.orgId;
  }
  if (params.search) {
    where.OR = [
      { action: { contains: params.search, mode: 'insensitive' } },
      { entityType: { contains: params.search, mode: 'insensitive' } },
      { entityId: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  const [logs, total, actions, entityTypes, organizations] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        organization: { select: { name: true } },
        user: { select: { name: true, email: true } },
      },
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog
      .groupBy({ by: ['action'], _count: true, orderBy: { action: 'asc' } })
      .then((r) => r.map((a) => a.action)),
    prisma.auditLog
      .groupBy({
        by: ['entityType'],
        _count: true,
        orderBy: { entityType: 'asc' },
      })
      .then((r) => r.map((e) => e.entityType)),
    prisma.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return {
    logs,
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    actions,
    entityTypes,
    organizations,
    days,
  };
}

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const {
    logs,
    total,
    page,
    totalPages,
    actions,
    entityTypes,
    organizations,
    days,
  } = await getAuditLogs(params);

  const extraParams = {
    action: params.action,
    entityType: params.entityType,
    search: params.search,
    orgId: params.orgId,
    days: String(days),
    sort: params.sort,
    order: params.order,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Activity Log</h1>
        <DateFilter days={days} baseUrl={BASE_URL} extraParams={extraParams} />
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="search"
          type="text"
          placeholder="Search action, entity type, entity ID..."
          defaultValue={params.search}
          className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
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
        <select
          name="action"
          defaultValue={params.action || ''}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All actions</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
        <select
          name="entityType"
          defaultValue={params.entityType || ''}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All entity types</option>
          {entityTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input type="hidden" name="days" value={days} />
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}
        {params.order && (
          <input type="hidden" name="order" value={params.order} />
        )}
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filter
        </button>
      </form>

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
              <SortableHeader
                label="Action"
                field="action"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <SortableHeader
                label="Entity Type"
                field="entityType"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <th className="px-4 py-3 text-left font-medium">Entity ID</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">{log.organization?.name ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {log.user?.name || log.user?.email || '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {log.entityType}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {log.entityId || '—'}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No activity logs found.
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
