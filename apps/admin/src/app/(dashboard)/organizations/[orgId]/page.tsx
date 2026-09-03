import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { formatDate, formatDateTime } from '@/lib/format';
import { formatDistanceToNow } from 'date-fns';
import prettyBytes from 'pretty-bytes';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AddMemberForm, MemberRowActions } from './MemberActions';

export const dynamic = 'force-dynamic';

async function getOrgDetails(orgId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      settings: true,
      _count: {
        select: {
          members: true,
          projects: true,
          apiKeys: true,
          teams: true,
          mcpConnectors: true,
        },
      },
    },
  });

  if (!org) {
    return null;
  }

  const [
    members,
    threadCount,
    messageCount,
    fileStats,
    aiUsageSummary,
    subscriptions,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.member.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            banned: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.thread.count({ where: { organizationId: orgId } }),
    prisma.message.count({
      where: { thread: { organizationId: orgId } },
    }),
    prisma.userFile.aggregate({
      where: { organizationId: orgId },
      _sum: { fileSize: true },
      _count: true,
    }),
    prisma.aiUsage.aggregate({
      where: { organizationId: orgId },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        estimatedCost: true,
      },
      _count: true,
    }),
    prisma.subscription.findMany({
      where: { referenceId: orgId },
      orderBy: { periodStart: 'desc' },
      take: 1,
    }),
    prisma.auditLog.findMany({
      where: { organizationId: orgId },
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    org,
    members,
    threadCount,
    messageCount,
    fileStats: {
      totalFiles: fileStats._count,
      totalSize: fileStats._sum.fileSize ?? 0,
    },
    aiUsage: {
      totalRequests: aiUsageSummary._count,
      inputTokens: aiUsageSummary._sum.inputTokens ?? 0,
      outputTokens: aiUsageSummary._sum.outputTokens ?? 0,
      totalTokens: aiUsageSummary._sum.totalTokens ?? 0,
      estimatedCost: aiUsageSummary._sum.estimatedCost ?? 0,
    },
    subscription: subscriptions[0] ?? null,
    recentAuditLogs,
  };
}

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const data = await getOrgDetails(orgId);

  if (!data) {
    notFound();
  }

  const {
    org,
    members,
    threadCount,
    messageCount,
    fileStats,
    aiUsage,
    subscription,
    recentAuditLogs,
  } = data;

  const storageLimit = org.settings?.storageLimitBytes
    ? Number(org.settings.storageLimitBytes)
    : null;
  const storagePercent = storageLimit
    ? (fileStats.totalSize / storageLimit) * 100
    : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/organizations"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{org.name}</h1>
          <p className="text-muted-foreground">
            {org.slug ? `/${org.slug}` : 'No slug'} &middot; Created{' '}
            {formatDistanceToNow(new Date(org.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Members" value={org._count.members} />
        <StatCard label="Projects" value={org._count.projects} />
        <StatCard label="Threads" value={threadCount} />
        <StatCard label="Messages" value={messageCount} />
      </div>

      {/* Settings & Subscription */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Settings</h3>
          <div className="space-y-3">
            <Row label="Model" value={org.settings?.model || 'default'} />
            <Row
              label="Temperature"
              value={org.settings?.temperature?.toString() ?? 'default'}
            />
            <Row
              label="Max Documents to Retrieve"
              value={
                org.settings?.maxDocumentsToRetrieve?.toString() ?? 'default'
              }
            />
            <Row
              label="Max Members"
              value={org.settings?.maxMembers?.toString() ?? 'unlimited'}
            />
            <Row
              label="Monthly Token Limit"
              value={
                org.settings?.monthlyTokenLimit
                  ? Number(org.settings.monthlyTokenLimit).toLocaleString()
                  : 'unlimited'
              }
            />
            <Row
              label="Monthly Message Limit"
              value={
                org.settings?.monthlyMessageLimit?.toLocaleString() ??
                'unlimited'
              }
            />
            <Row
              label="Monthly Cost Limit"
              value={
                org.settings?.monthlyCostLimitCents
                  ? `$${(org.settings.monthlyCostLimitCents / 100).toFixed(2)}`
                  : 'unlimited'
              }
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Subscription</h3>
          {subscription ? (
            <div className="space-y-3">
              <Row label="Plan" value={subscription.plan} />
              <Row label="Status" value={subscription.status} />
              <Row label="Seats" value={String(subscription.seats)} />
              {subscription.periodStart && (
                <Row
                  label="Period"
                  value={`${formatDate(subscription.periodStart)} — ${subscription.periodEnd ? formatDate(subscription.periodEnd) : 'ongoing'}`}
                />
              )}
              <Row
                label="Cancel at Period End"
                value={subscription.cancelAtPeriodEnd ? 'Yes' : 'No'}
              />
              <Row
                label="Source"
                value={subscription.stripeSubscriptionId ? 'Stripe' : 'Manual'}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No subscription found.
            </p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Read-only. Plans are billed through Stripe; what each one grants is
            set in{' '}
            <Link href="/features/plans" className="underline">
              Subscription Plans
            </Link>
            , and per-organization exceptions in{' '}
            <Link href="/features" className="underline">
              Feature Overrides
            </Link>
            .
          </p>
        </div>
      </div>

      {/* AI Usage & Disk Usage */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">AI Usage (all time)</h3>
          <div className="space-y-3">
            <Row
              label="Total Requests"
              value={aiUsage.totalRequests.toLocaleString()}
            />
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
              value={fileStats.totalFiles.toLocaleString()}
            />
            <Row label="Used" value={prettyBytes(fileStats.totalSize)} />
            <Row
              label="Limit"
              value={storageLimit ? prettyBytes(storageLimit) : 'Unlimited'}
            />
            {storagePercent !== null && (
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-muted-foreground">Usage</span>
                  <span className="font-medium">
                    {storagePercent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary">
                  <div
                    className={`h-2 rounded-full ${storageBarColor(storagePercent)}`}
                    style={{ width: `${Math.min(100, storagePercent)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Integrations */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Integrations</h3>
          <div className="space-y-3">
            <Row
              label="API Keys"
              value={
                org._count.apiKeys > 0 ? (
                  <Link
                    href={`/api-keys?orgId=${org.id}`}
                    className="underline"
                  >
                    {org._count.apiKeys}
                  </Link>
                ) : (
                  '0'
                )
              }
            />
            <Row label="Teams" value={String(org._count.teams)} />
            <Row
              label="MCP Connectors"
              value={String(org._count.mcpConnectors)}
            />
            <Row
              label="Vector Store"
              value={org.vectorStore || 'Not configured'}
            />
            <Row
              label="Has Knowledge"
              value={org.hasKnowledge ? 'Yes' : 'No'}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">API Key Providers</h3>
          <div className="space-y-3">
            <ProviderRow label="OpenAI" hasKey={!!org.settings?.openaiApiKey} />
            <ProviderRow
              label="Anthropic"
              hasKey={!!org.settings?.anthropicApiKey}
            />
            <ProviderRow label="Google" hasKey={!!org.settings?.googleApiKey} />
            <ProviderRow
              label="OpenRouter"
              hasKey={!!org.settings?.openrouterApiKey}
            />
            <ProviderRow
              label="Fireworks"
              hasKey={!!org.settings?.fireworksApiKey}
            />
            <ProviderRow
              label="Bedrock"
              hasKey={!!org.settings?.bedrockCredentials}
            />
            <ProviderRow
              label="Azure OpenAI"
              hasKey={!!org.settings?.azureOpenaiCredentials}
            />
            <ProviderRow label="Ollama" hasKey={!!org.settings?.ollamaHost} />
          </div>
        </div>
      </div>

      {/* Members */}
      <div>
        <div className="mb-4 space-y-4">
          <h2 className="text-xl font-semibold">Members ({members.length})</h2>
          <AddMemberForm orgId={org.id} />
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Org Role</th>
                <th className="px-4 py-3 text-left font-medium">App Role</th>
                <th className="px-4 py-3 text-left font-medium">Joined Org</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr
                  key={member.id}
                  className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
                >
                  <td className="px-4 py-3 font-medium">
                    <a
                      href={`/users/${member.user.id}`}
                      className="hover:underline"
                    >
                      {member.user.name || '—'}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {member.user.email}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        member.role === 'owner'
                          ? 'rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
                          : 'text-muted-foreground'
                      }
                    >
                      {member.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {member.user.role}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDistanceToNow(new Date(member.createdAt), {
                      addSuffix: true,
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {member.user.banned ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        Banned
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <MemberRowActions
                      orgId={org.id}
                      userId={member.user.id}
                      email={member.user.email}
                      role={member.role}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Audit Logs */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">Recent Activity Log</h2>
        <div className="rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">User</th>
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

function storageBarColor(percent: number): string {
  if (percent > 90) {
    return 'bg-destructive';
  }
  if (percent > 70) {
    return 'bg-yellow-500';
  }
  return 'bg-green-500';
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function ProviderRow({ label, hasKey }: { label: string; hasKey: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`text-xs font-medium ${hasKey ? 'text-green-600' : 'text-muted-foreground'}`}
      >
        {hasKey ? 'Configured' : '—'}
      </span>
    </div>
  );
}
