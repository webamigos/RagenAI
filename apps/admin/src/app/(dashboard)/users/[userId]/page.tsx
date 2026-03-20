import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { formatDateTime } from '@/lib/format';
import { formatDistanceToNow } from 'date-fns';
import prettyBytes from 'pretty-bytes';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function getUserDetails(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      members: {
        include: { organization: { select: { id: true, name: true } } },
      },
      _count: { select: { sessions: true } },
    },
  });

  if (!user) {
    return null;
  }

  const orgIds = user.members.map((m) => m.organizationId);

  const [
    threadCount,
    messageCount,
    aiUsageSummary,
    diskUsage,
    connectors,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.thread.count({
      where: { organizationId: { in: orgIds }, userId: user.id },
    }),
    prisma.message.count({
      where: {
        thread: { organizationId: { in: orgIds }, userId: user.id },
      },
    }),
    prisma.aiUsage.aggregate({
      where: { userId: user.id },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        estimatedCost: true,
      },
      _count: true,
    }),
    prisma.userFile.aggregate({
      where: { organizationId: { in: orgIds } },
      _sum: { fileSize: true },
      _count: true,
    }),
    prisma.mcpConnector.findMany({
      where: { userId: user.id },
      select: {
        provider: true,
        status: true,
        enabled: true,
        connectedAt: true,
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.findMany({
      where: { userId: user.id },
      include: {
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    user,
    threadCount,
    messageCount,
    aiUsage: {
      totalRequests: aiUsageSummary._count,
      inputTokens: aiUsageSummary._sum.inputTokens ?? 0,
      outputTokens: aiUsageSummary._sum.outputTokens ?? 0,
      totalTokens: aiUsageSummary._sum.totalTokens ?? 0,
      estimatedCost: aiUsageSummary._sum.estimatedCost ?? 0,
    },
    diskUsage: {
      totalFiles: diskUsage._count,
      totalSize: diskUsage._sum.fileSize ?? 0,
    },
    connectors,
    recentAuditLogs,
  };
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const data = await getUserDetails(userId);

  if (!data) {
    notFound();
  }

  const {
    user,
    threadCount,
    messageCount,
    aiUsage,
    diskUsage,
    connectors,
    recentAuditLogs,
  } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/users"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{user.name || 'Unnamed User'}</h1>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              user.role === 'admin'
                ? 'rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary'
                : 'rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground'
            }
          >
            {user.role}
          </span>
          {user.banned ? (
            <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
              Banned
            </span>
          ) : (
            <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-600">
              Active
            </span>
          )}
        </div>
      </div>

      {/* User Info */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          label="Joined"
          value={formatDistanceToNow(new Date(user.createdAt), {
            addSuffix: true,
          })}
        />
        <InfoCard
          label="Active Sessions"
          value={String(user._count.sessions)}
        />
        <InfoCard
          label="Email Verified"
          value={user.emailVerified ? 'Yes' : 'No'}
        />
        <InfoCard
          label="Organizations"
          value={
            user.members.map((m) => m.organization.name).join(', ') || 'None'
          }
        />
      </div>

      {/* Stats */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">Activity</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Threads" value={threadCount} />
          <StatCard label="Messages" value={messageCount} />
          <StatCard label="AI Requests" value={aiUsage.totalRequests} />
          <StatCard
            label="AI Cost"
            value={`$${aiUsage.estimatedCost.toFixed(2)}`}
          />
        </div>
      </div>

      {/* AI Usage & Disk Usage */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">AI Usage (all time)</h3>
          <div className="space-y-3">
            <Row
              label="Input Tokens"
              value={aiUsage.inputTokens.toLocaleString()}
            />
            <Row
              label="Output Tokens"
              value={aiUsage.outputTokens.toLocaleString()}
            />
            <Row
              label="Total Tokens"
              value={aiUsage.totalTokens.toLocaleString()}
            />
            <Row
              label="Estimated Cost"
              value={`$${aiUsage.estimatedCost.toFixed(4)}`}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Disk Usage</h3>
          <div className="space-y-3">
            <Row
              label="Total Files"
              value={diskUsage.totalFiles.toLocaleString()}
            />
            <Row label="Total Size" value={prettyBytes(diskUsage.totalSize)} />
          </div>
        </div>
      </div>

      {/* Connectors */}
      {connectors.length > 0 && (
        <div>
          <h2 className="mb-4 text-xl font-semibold">
            Connectors ({connectors.length})
          </h2>
          <div className="rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Provider</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Organization
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Enabled</th>
                  <th className="px-4 py-3 text-left font-medium">Connected</th>
                </tr>
              </thead>
              <tbody>
                {connectors.map((c, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {c.provider.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.organization.name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.status === 'CONNECTED'
                            ? 'bg-green-500/10 text-green-600'
                            : c.status === 'ERROR'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-yellow-500/10 text-yellow-600'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.enabled ? 'Yes' : 'No'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.connectedAt ? formatDateTime(c.connectedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Audit Logs */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">Recent Activity Log</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">
                  Organization
                </th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
                <th className="px-4 py-3 text-left font-medium">Entity Type</th>
                <th className="px-4 py-3 text-left font-medium">Entity ID</th>
              </tr>
            </thead>
            <tbody>
              {recentAuditLogs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-4 py-3">{log.organization?.name ?? '—'}</td>
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
              {recentAuditLogs.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No activity logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
