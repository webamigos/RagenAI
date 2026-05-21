import { prisma } from '@/lib/db';
import { SortableHeader } from '@/app/components/SortableHeader';
import { Pagination } from '@/app/components/Pagination';
import { SubscriptionActions } from './components/SubscriptionActions';
import { formatDate } from '@/lib/format';
import { SearchableSelect } from '@/app/components/SearchableSelect';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface SearchParams {
  page?: string;
  search?: string;
  status?: string;
  plan?: string;
  sort?: string;
  order?: string;
  view?: 'per-org' | 'all';
}

const PLAN_TIER: Record<string, number> = { Trial: 0 };
function planRank(plan: string): number {
  return PLAN_TIER[plan] ?? 1;
}
function toNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed !== '' && !isNaN(Number(trimmed))) {
      return Number(trimmed);
    }
  }
  return null;
}

function compareKey(
  av: unknown,
  bv: unknown,
): [number | string, number | string] {
  if (av instanceof Date && bv instanceof Date) {
    return [av.getTime(), bv.getTime()];
  }
  const aNum = toNumeric(av);
  const bNum = toNumeric(bv);
  if (aNum !== null && bNum !== null) {
    return [aNum, bNum];
  }
  return [String(av), String(bv)];
}

function subscriptionScore(s: {
  status: string;
  plan: string;
  periodStart: Date | null;
}): number {
  let score = 0;
  if (s.status === 'active') {
    score += 4_000_000;
  } else if (s.status === 'trialing') {
    score += 2_000_000;
  }
  score += planRank(s.plan) * 1_000_000;
  if (s.periodStart) {
    score += Math.floor(s.periodStart.getTime() / 1000);
  }
  return score;
}

const PAGE_SIZE = 25;
const BASE_URL = '/subscriptions';

type SortField = 'status' | 'plan' | 'periodStart' | 'periodEnd' | 'seats';
const VALID_SORTS: SortField[] = [
  'status',
  'plan',
  'periodStart',
  'periodEnd',
  'seats',
];

async function getSubscriptions(params: SearchParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const view = params.view === 'all' ? 'all' : 'per-org';

  const sortField = VALID_SORTS.includes(params.sort as SortField)
    ? (params.sort as SortField)
    : 'periodStart';
  const sortOrder = params.order === 'asc' ? 'asc' : 'desc';

  const where: Record<string, unknown> = {};
  if (params.status) {
    where.status = params.status;
  }
  if (params.plan) {
    where.plan = params.plan;
  }
  if (params.search) {
    where.OR = [
      { stripeCustomerId: { contains: params.search, mode: 'insensitive' } },
      {
        stripeSubscriptionId: { contains: params.search, mode: 'insensitive' },
      },
      { referenceId: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  if (view === 'all') {
    // Each facet reflects the other active filters but not its own — so the
    // user can still see alternative options for the column they're filtering.
    const { status: _omitStatus, ...whereForStatusFacet } = where;
    const { plan: _omitPlan, ...whereForPlanFacet } = where;
    const [subscriptions, total, statuses, plans] = await Promise.all([
      prisma.subscription.findMany({
        where,
        orderBy: { [sortField]: sortOrder },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.subscription.count({ where }),
      prisma.subscription
        .groupBy({
          by: ['status'],
          _count: true,
          where: whereForStatusFacet,
          orderBy: { status: 'asc' },
        })
        .then((r) => r.map((s) => ({ status: s.status, count: s._count }))),
      prisma.subscription
        .groupBy({
          by: ['plan'],
          _count: true,
          where: whereForPlanFacet,
          orderBy: { plan: 'asc' },
        })
        .then((r) => r.map((p) => ({ plan: p.plan, count: p._count }))),
    ]);

    const refIds = [...new Set(subscriptions.map((s) => s.referenceId))];
    const orgs = refIds.length
      ? await prisma.organization.findMany({
          where: { id: { in: refIds } },
          select: { id: true, name: true },
        })
      : [];
    const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

    return {
      view,
      subscriptions: subscriptions.map((s) => ({
        ...s,
        orgName: orgMap.get(s.referenceId) || null,
        duplicateCount: 0,
      })),
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE),
      statuses,
      plans,
    };
  }

  // per-org view: load all matching rows, dedupe by referenceId keeping the
  // "best" row (active paid > trialing paid > trialing Trial > other), then
  // paginate. We accept loading everything because the dataset is small at
  // current scale; revisit if subscription rows reach 10k+.
  const allRows = await prisma.subscription.findMany({
    where,
    select: {
      id: true,
      plan: true,
      referenceId: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      cancelAtPeriodEnd: true,
      seats: true,
      trialStart: true,
      trialEnd: true,
    },
  });

  const byRef = new Map<
    string,
    { best: (typeof allRows)[number]; count: number }
  >();
  for (const row of allRows) {
    const entry = byRef.get(row.referenceId);
    if (!entry) {
      byRef.set(row.referenceId, { best: row, count: 1 });
      continue;
    }
    entry.count += 1;
    if (subscriptionScore(row) > subscriptionScore(entry.best)) {
      entry.best = row;
    }
  }

  const deduped = Array.from(byRef.values()).map((e) => ({
    row: e.best,
    duplicateCount: e.count - 1,
  }));

  deduped.sort((a, b) => {
    const av = (a.row as Record<string, unknown>)[sortField];
    const bv = (b.row as Record<string, unknown>)[sortField];
    if (av == null && bv == null) {
      return 0;
    }
    if (av == null) {
      return 1;
    }
    if (bv == null) {
      return -1;
    }
    const [aKey, bKey] = compareKey(av, bv);
    if (aKey < bKey) {
      return sortOrder === 'asc' ? -1 : 1;
    }
    if (aKey > bKey) {
      return sortOrder === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const total = deduped.length;
  const pageRows = deduped.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const refIds = [...new Set(pageRows.map((r) => r.row.referenceId))];
  const orgs = refIds.length
    ? await prisma.organization.findMany({
        where: { id: { in: refIds } },
        select: { id: true, name: true },
      })
    : [];
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

  // Status/plan facets reflect the deduped view (one row per org)
  const statusCounts = new Map<string, number>();
  const planCounts = new Map<string, number>();
  for (const { row } of deduped) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
    planCounts.set(row.plan, (planCounts.get(row.plan) ?? 0) + 1);
  }

  return {
    view,
    subscriptions: pageRows.map(({ row, duplicateCount }) => ({
      ...row,
      orgName: orgMap.get(row.referenceId) || null,
      duplicateCount,
    })),
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    statuses: [...statusCounts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => a.status.localeCompare(b.status)),
    plans: [...planCounts.entries()]
      .map(([plan, count]) => ({ plan, count }))
      .sort((a, b) => a.plan.localeCompare(b.plan)),
  };
}

const statusColors: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600',
  trialing: 'bg-blue-500/10 text-blue-600',
  past_due: 'bg-yellow-500/10 text-yellow-600',
  canceled: 'bg-muted text-muted-foreground',
  unpaid: 'bg-destructive/10 text-destructive',
  incomplete: 'bg-yellow-500/10 text-yellow-600',
  incomplete_expired: 'bg-destructive/10 text-destructive',
  paused: 'bg-muted text-muted-foreground',
};

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [result, availablePlans] = await Promise.all([
    getSubscriptions(params),
    prisma.subscriptionPlan.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, priceId: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  const { view, subscriptions, total, page, totalPages, statuses, plans } =
    result;

  const plansForActions = availablePlans.map((p) => ({
    id: p.id,
    name: p.name,
    priceId: p.priceId,
  }));

  const extraParams = {
    search: params.search,
    status: params.status,
    plan: params.plan,
    sort: params.sort,
    order: params.order,
    view: params.view,
  };

  // Summary cards
  const activeCount = statuses.find((s) => s.status === 'active')?.count ?? 0;
  const trialingCount =
    statuses.find((s) => s.status === 'trialing')?.count ?? 0;
  const canceledCount =
    statuses.find((s) => s.status === 'canceled')?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Subscriptions</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{total} total</span>
          <div className="inline-flex rounded-md border border-border text-xs">
            <Link
              href={`/subscriptions?${new URLSearchParams({
                ...Object.fromEntries(
                  Object.entries(extraParams).filter(
                    ([, v]) => typeof v === 'string' && v.length > 0,
                  ) as [string, string][],
                ),
                view: 'per-org',
              }).toString()}`}
              className={`px-3 py-1.5 ${
                view === 'per-org'
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Per org
            </Link>
            <Link
              href={`/subscriptions?${new URLSearchParams({
                ...Object.fromEntries(
                  Object.entries(extraParams).filter(
                    ([, v]) => typeof v === 'string' && v.length > 0,
                  ) as [string, string][],
                ),
                view: 'all',
              }).toString()}`}
              className={`px-3 py-1.5 border-l border-border ${
                view === 'all'
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All rows
            </Link>
          </div>
          <Link
            href="/subscriptions/plans"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Manage Plans
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="mt-2 text-3xl font-bold">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Trialing</p>
          <p className="mt-2 text-3xl font-bold">{trialingCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Canceled</p>
          <p className="mt-2 text-3xl font-bold">{canceledCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="mt-2 text-3xl font-bold">{total}</p>
        </div>
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="search"
          type="text"
          placeholder="Search by Stripe ID or org ID..."
          defaultValue={params.search}
          className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <SearchableSelect
          name="status"
          value={params.status}
          placeholder="All statuses"
          options={statuses.map((s) => ({
            value: s.status,
            label: `${s.status} (${s.count})`,
          }))}
          className="w-48"
        />
        <SearchableSelect
          name="plan"
          value={params.plan}
          placeholder="All plans"
          options={plans.map((p) => ({
            value: p.plan,
            label: `${p.plan} (${p.count})`,
          }))}
          className="w-48"
        />
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}
        {params.order && (
          <input type="hidden" name="order" value={params.order} />
        )}
        {params.view && <input type="hidden" name="view" value={params.view} />}
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filter
        </button>
      </form>

      <div className="rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Organization</th>
              <SortableHeader
                label="Plan"
                field="plan"
                currentSort={params.sort || 'periodStart'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <SortableHeader
                label="Status"
                field="status"
                currentSort={params.sort || 'periodStart'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <SortableHeader
                label="Seats"
                field="seats"
                currentSort={params.sort || 'periodStart'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-right"
              />
              <SortableHeader
                label="Period Start"
                field="periodStart"
                currentSort={params.sort || 'periodStart'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <SortableHeader
                label="Period End"
                field="periodEnd"
                currentSort={params.sort || 'periodStart'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <th className="px-4 py-3 text-left font-medium">Cancel</th>
              <th className="px-4 py-3 text-left font-medium">Trial</th>
              <th className="px-4 py-3 text-left font-medium">Stripe ID</th>
              <th className="w-10 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((sub) => (
              <tr
                key={sub.id}
                className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
              >
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    {sub.orgName ? (
                      <a
                        href={`/organizations/${sub.referenceId}`}
                        className="hover:underline"
                      >
                        {sub.orgName}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">
                        {sub.referenceId}
                      </span>
                    )}
                    {sub.duplicateCount > 0 && (
                      <Link
                        href={`/subscriptions?search=${encodeURIComponent(sub.referenceId)}&view=all`}
                        title={`${sub.duplicateCount} other subscription row${sub.duplicateCount === 1 ? '' : 's'} for this org`}
                        className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-700 hover:bg-yellow-500/20"
                      >
                        +{sub.duplicateCount}
                      </Link>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                    {sub.plan}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      statusColors[sub.status] ||
                      'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {sub.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {sub.seats}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {sub.periodStart ? formatDate(sub.periodStart) : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {sub.periodEnd ? formatDate(sub.periodEnd) : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {sub.cancelAtPeriodEnd ? (
                    <span className="text-xs text-destructive">Yes</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {sub.trialStart && sub.trialEnd ? (
                    <span className="text-xs">
                      {formatDate(sub.trialStart)} – {formatDate(sub.trialEnd)}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {sub.stripeSubscriptionId || '—'}
                </td>
                <td className="px-4 py-3">
                  <SubscriptionActions
                    subscriptionId={sub.id}
                    organizationId={sub.referenceId}
                    currentPlan={sub.plan}
                    currentSeats={sub.seats}
                    cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
                    hasStripeId={!!sub.stripeSubscriptionId}
                    plans={plansForActions}
                  />
                </td>
              </tr>
            ))}
            {subscriptions.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No subscriptions found.
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
