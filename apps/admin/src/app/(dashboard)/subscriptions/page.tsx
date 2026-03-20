import { prisma } from '@/lib/db';
import { SortableHeader } from '@/app/components/SortableHeader';
import { Pagination } from '@/app/components/Pagination';
import { SubscriptionActions } from './components/SubscriptionActions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface SearchParams {
  page?: string;
  search?: string;
  status?: string;
  plan?: string;
  sort?: string;
  order?: string;
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

  const [subscriptions, total, statuses, plans] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.subscription.count({ where }),
    prisma.subscription
      .groupBy({ by: ['status'], _count: true, orderBy: { status: 'asc' } })
      .then((r) => r.map((s) => ({ status: s.status, count: s._count }))),
    prisma.subscription
      .groupBy({ by: ['plan'], _count: true, orderBy: { plan: 'asc' } })
      .then((r) => r.map((p) => ({ plan: p.plan, count: p._count }))),
  ]);

  // Resolve org names from referenceId
  const refIds = [...new Set(subscriptions.map((s) => s.referenceId))];
  const orgs = refIds.length
    ? await prisma.organization.findMany({
        where: { id: { in: refIds } },
        select: { id: true, name: true },
      })
    : [];
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

  return {
    subscriptions: subscriptions.map((s) => ({
      ...s,
      orgName: orgMap.get(s.referenceId) || null,
    })),
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    statuses,
    plans,
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
  const { subscriptions, total, page, totalPages, statuses, plans } = result;

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
        <select
          name="status"
          defaultValue={params.status || ''}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s.status} value={s.status}>
              {s.status} ({s.count})
            </option>
          ))}
        </select>
        <select
          name="plan"
          defaultValue={params.plan || ''}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All plans</option>
          {plans.map((p) => (
            <option key={p.plan} value={p.plan}>
              {p.plan} ({p.count})
            </option>
          ))}
        </select>
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
                  {sub.periodStart
                    ? new Date(sub.periodStart).toLocaleDateString()
                    : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {sub.periodEnd
                    ? new Date(sub.periodEnd).toLocaleDateString()
                    : '—'}
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
                      {new Date(sub.trialStart).toLocaleDateString()} –{' '}
                      {new Date(sub.trialEnd).toLocaleDateString()}
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
