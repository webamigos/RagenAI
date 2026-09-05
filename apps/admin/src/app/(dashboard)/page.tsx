import prettyBytes from 'pretty-bytes';
import {
  AI_USAGE_SUM_FIELDS,
  toAiUsageTotals,
} from '@ragenai/platform-contracts';

import { prisma } from '@/lib/db';
import { StatTile } from '@/app/components/StatTile';

export const dynamic = 'force-dynamic';

async function getStats() {
  const [
    userCount,
    orgCount,
    threadCount,
    fileCount,
    aiUsageAggregate,
    diskUsageAggregate,
    unresolvedCriticalIncidents,
    failingConnectors,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
    prisma.thread.count(),
    prisma.userFile.count(),
    // All-time, platform-wide — matches the other four tiles on this page,
    // none of which apply a date window either.
    prisma.aiUsage.aggregate({ _sum: AI_USAGE_SUM_FIELDS, _count: true }),
    prisma.userFile.aggregate({ _sum: { fileSize: true } }),
    prisma.securityEvent.count({
      where: { severity: 'critical', resolvedAt: null },
    }),
    prisma.mcpConnector.count({ where: { status: 'ERROR' } }),
  ]);

  return {
    userCount,
    orgCount,
    threadCount,
    fileCount,
    aiUsageTotals: toAiUsageTotals(aiUsageAggregate),
    diskUsageBytes: diskUsageAggregate._sum.fileSize ?? 0,
    unresolvedCriticalIncidents,
    failingConnectors,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Users"
          value={stats.userCount.toLocaleString()}
          href="/users"
        />
        <StatTile
          label="Organizations"
          value={stats.orgCount.toLocaleString()}
          href="/organizations"
        />
        <StatTile label="Threads" value={stats.threadCount.toLocaleString()} />
        <StatTile label="Files" value={stats.fileCount.toLocaleString()} />
        <StatTile
          label="AI spend (all-time)"
          value={`€${stats.aiUsageTotals.estimatedCost.toFixed(2)}`}
          href="/ai-usage"
        />
        <StatTile
          label="Disk usage"
          value={prettyBytes(stats.diskUsageBytes)}
          href="/disk-usage"
        />
        <StatTile
          label="Critical incidents"
          value={stats.unresolvedCriticalIncidents.toLocaleString()}
          href="/incidents"
          tone={stats.unresolvedCriticalIncidents > 0 ? 'warn' : undefined}
        />
        <StatTile
          label="Failing connectors"
          value={stats.failingConnectors.toLocaleString()}
          href="/connector-health"
          tone={stats.failingConnectors > 0 ? 'warn' : undefined}
        />
      </div>
    </div>
  );
}
