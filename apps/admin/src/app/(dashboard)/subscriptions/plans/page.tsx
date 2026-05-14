import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SyncPlansButton } from './SyncPlansButton';
import { PlanFeaturesButton } from './PlanFeaturesButton';
import { FEATURE_KEYS, type FeatureKey } from '../../features/feature-keys';

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
              <th className="px-4 py-3 text-left font-medium">Features</th>
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
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${planStatusColor(
                      plan.status,
                    )}`}
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
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-2">
                    <FeaturesDisplay features={plan.features} />
                    <PlanFeaturesButton
                      planId={plan.id}
                      planName={plan.name}
                      features={normalizeFeatures(plan.features)}
                    />
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {plan.lastSyncedAt ? formatDateTime(plan.lastSyncedAt) : '—'}
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr>
                <td
                  colSpan={9}
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

function planStatusColor(status: string): string {
  if (status === 'ACTIVE') {
    return 'bg-green-500/10 text-green-600';
  }
  if (status === 'ARCHIVED') {
    return 'bg-muted text-muted-foreground';
  }
  return 'bg-destructive/10 text-destructive';
}

function normalizeFeatures(features: unknown): Record<string, boolean> {
  if (!features || typeof features !== 'object') {
    return {};
  }
  const record = features as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const key of FEATURE_KEYS) {
    if (record[key] === true || record[key] === false) {
      out[key] = record[key] as boolean;
    }
  }
  return out;
}

function FeaturesDisplay({ features }: { features: unknown }) {
  const normalized = normalizeFeatures(features);
  const entries = Object.entries(normalized) as [FeatureKey, boolean][];
  if (entries.length === 0) {
    return <span className="text-xs text-muted-foreground">unset</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className={`rounded px-1.5 py-0.5 text-xs ${
            value
              ? 'bg-green-500/10 text-green-600'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {key}: {value ? 'on' : 'off'}
        </span>
      ))}
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
