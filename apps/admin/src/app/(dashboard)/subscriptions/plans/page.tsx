import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SyncPlansButton } from './SyncPlansButton';

export const dynamic = 'force-dynamic';

async function getPlans() {
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: { name: 'asc' },
  });

  // Count subscriptions per plan
  const planCounts = await prisma.subscription.groupBy({
    by: ['plan'],
    _count: true,
  });
  const countMap = new Map(planCounts.map((p) => [p.plan, p._count]));

  return plans.map((plan) => ({
    ...plan,
    subscriptionCount: countMap.get(plan.name) ?? 0,
  }));
}

export default async function PlansPage() {
  const plans = await getPlans();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/subscriptions"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-3xl font-bold">Subscription Plans</h1>
        <SyncPlansButton />
      </div>

      <div className="rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Price ID</th>
              <th className="px-4 py-3 text-left font-medium">Product ID</th>
              <th className="px-4 py-3 text-right font-medium">
                Subscriptions
              </th>
              <th className="px-4 py-3 text-left font-medium">Limits</th>
              <th className="px-4 py-3 text-left font-medium">Last Synced</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr
                key={plan.id}
                className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
              >
                <td className="px-4 py-3 font-medium">{plan.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      plan.type === 'STRIPE'
                        ? 'bg-blue-500/10 text-blue-600'
                        : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {plan.type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      plan.status === 'ACTIVE'
                        ? 'bg-green-500/10 text-green-600'
                        : plan.status === 'ARCHIVED'
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-destructive/10 text-destructive'
                    }`}
                  >
                    {plan.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {plan.priceId}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {plan.productId || '—'}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {plan.subscriptionCount}
                </td>
                <td className="px-4 py-3">
                  <LimitsDisplay limits={plan.limits} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {plan.lastSyncedAt ? formatDateTime(plan.lastSyncedAt) : '—'}
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No plans found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LimitsDisplay({ limits }: { limits: unknown }) {
  if (!limits || typeof limits !== 'object') {
    return <span className="text-muted-foreground">—</span>;
  }

  const entries = Object.entries(limits as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined,
  );

  if (entries.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {entries.slice(0, 3).map(([key, value]) => (
        <span
          key={key}
          className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
          title={`${key}: ${value}`}
        >
          {key}: {String(value)}
        </span>
      ))}
      {entries.length > 3 && (
        <span className="text-xs text-muted-foreground">
          +{entries.length - 3} more
        </span>
      )}
    </div>
  );
}
