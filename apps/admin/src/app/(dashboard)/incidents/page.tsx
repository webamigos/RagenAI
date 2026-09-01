import { prisma } from '@/lib/db';
import { formatDistanceToNow } from 'date-fns';
import { Pagination } from '@/app/components/Pagination';
import type { Prisma } from '../../../../../web/src/generated/prisma/client';

export const dynamic = 'force-dynamic';

interface SearchParams {
  page?: string;
  severity?: string;
  eventType?: string;
  resolved?: string;
  period?: string;
  organizationId?: string;
}

const PAGE_SIZE = 25;
const BASE_URL = '/incidents';

const VALID_SEVERITIES = ['info', 'warn', 'critical'] as const;

function periodToDateFilter(period?: string) {
  const map: Record<string, number> = { '1d': 1, '7d': 7, '30d': 30 };
  const days = period && period in map ? map[period] : 7;
  const since = new Date();
  since.setDate(since.getDate() - days);
  return { gte: since };
}

async function getIncidents(params: SearchParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const where: Prisma.SecurityEventWhereInput = {
    createdAt: periodToDateFilter(params.period),
  };

  if (
    params.severity &&
    VALID_SEVERITIES.includes(
      params.severity as (typeof VALID_SEVERITIES)[number],
    )
  ) {
    where.severity = params.severity as (typeof VALID_SEVERITIES)[number];
  }
  if (params.organizationId) {
    where.organizationId = params.organizationId;
  }
  if (params.eventType) {
    where.eventType =
      params.eventType as Prisma.SecurityEventWhereInput['eventType'];
  }
  if (params.resolved === 'true') {
    where.resolvedAt = { not: null };
  } else if (params.resolved === 'false') {
    where.resolvedAt = null;
  }

  const [events, total] = await Promise.all([
    prisma.securityEvent.findMany({
      where,
      // NOTE: this relies on Postgres enum sort order, which follows the
      // CREATE TYPE declaration order (`info < warn < critical`), NOT
      // alphabetical. With `severity: 'desc'` we get critical first, then
      // warn, then info — the intended prioritization. Do not "fix" this
      // to a CASE expression unless you also re-verify the enum order.
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        organization: { select: { id: true, name: true } },
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.securityEvent.count({ where }),
  ]);

  return {
    events,
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

const SEVERITY_STYLE: Record<string, string> = {
  info: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  critical:
    'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-semibold',
};

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { events, total, page, totalPages } = await getIncidents(params);

  const extraParams = {
    severity: params.severity,
    resolved: params.resolved,
    period: params.period ?? '7d',
    eventType: params.eventType,
    organizationId: params.organizationId,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Security Incidents</h1>
        <span className="text-sm text-muted-foreground">{total} total</span>
      </div>

      {/* Filters as a GET form so it matches the organizations page pattern */}
      <form className="flex flex-wrap gap-2 text-sm">
        <input
          type="text"
          name="eventType"
          defaultValue={params.eventType ?? ''}
          placeholder="Event type (e.g. AUTH_LOGIN_FAILED)"
          aria-label="Event type filter"
          className="w-64 rounded-md border border-input bg-background px-2 py-1 font-mono text-xs placeholder:text-muted-foreground"
        />
        <input
          type="text"
          name="organizationId"
          defaultValue={params.organizationId ?? ''}
          placeholder="Organization ID"
          aria-label="Organization filter"
          className="w-48 rounded-md border border-input bg-background px-2 py-1 font-mono text-xs placeholder:text-muted-foreground"
        />
        <select
          name="severity"
          defaultValue={params.severity ?? ''}
          aria-label="Severity filter"
          className="rounded-md border border-input bg-background px-2 py-1"
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="warn">Warning</option>
          <option value="info">Info</option>
        </select>
        <select
          name="resolved"
          defaultValue={params.resolved ?? ''}
          aria-label="Resolved filter"
          className="rounded-md border border-input bg-background px-2 py-1"
        >
          <option value="">All status</option>
          <option value="false">Unresolved</option>
          <option value="true">Resolved</option>
        </select>
        <select
          name="period"
          defaultValue={params.period ?? '7d'}
          aria-label="Period filter"
          className="rounded-md border border-input bg-background px-2 py-1"
        >
          <option value="1d">Last 24h</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground hover:bg-primary/90"
        >
          Apply
        </button>
      </form>

      <div className="rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 text-left font-medium">Severity</th>
              <th className="px-4 py-3 text-left font-medium">Event</th>
              <th className="px-4 py-3 text-left font-medium">Source</th>
              <th className="px-4 py-3 text-left font-medium">Organization</th>
              <th className="px-4 py-3 text-left font-medium">User</th>
              <th className="px-4 py-3 text-left font-medium">IP</th>
              <th className="px-4 py-3 text-left font-medium">Resolved</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr
                key={e.id}
                className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
              >
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDistanceToNow(new Date(e.createdAt), {
                    addSuffix: true,
                  })}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                      SEVERITY_STYLE[e.severity] ?? SEVERITY_STYLE.info
                    }`}
                  >
                    {e.severity.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  <a
                    href={`/incidents/${e.publicId}`}
                    className="hover:underline"
                  >
                    {e.eventType}
                  </a>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {e.source}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {e.organization ? (
                    <a
                      href={`/organizations/${e.organization.id}`}
                      className="hover:underline"
                    >
                      {e.organization.name}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {e.user?.email ?? '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {e.ipAddress ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {e.resolvedAt
                    ? new Date(e.resolvedAt).toLocaleDateString()
                    : '—'}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No security incidents found in this window.
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
