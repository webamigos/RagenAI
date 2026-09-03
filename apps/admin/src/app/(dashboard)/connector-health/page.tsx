import { formatDistanceToNow } from 'date-fns';

import { ExportButton } from '@/app/components/ExportButton';
import { Pagination } from '@/app/components/Pagination';
import { SearchableSelect } from '@/app/components/SearchableSelect';
import { prisma } from '@/lib/db';
import { isVaultConfigured } from '@/lib/vault';

import { ConnectorHealthActions } from './ConnectorHealthActions';

export const dynamic = 'force-dynamic';

/**
 * Which MCP connectors are broken, and why.
 *
 * This page could not have existed before the commit that precedes it.
 * `status` only ever held `CONNECTED` or `PENDING` — nothing wrote `ERROR` —
 * so "show me the failing connectors" would have returned an empty table
 * forever while users' assistants quietly lost their tools.
 *
 * Failing connectors sort first, and within them the newest fault first,
 * because the reason to open this page is a support request that just
 * arrived.
 */

interface SearchParams {
  page?: string;
  orgId?: string;
  status?: string;
  provider?: string;
}

const PAGE_SIZE = 25;
const BASE_URL = '/connector-health';

/** Matches `RETRY_FAILED_AFTER_MINUTES` in `getEnabledConnectorsQuery`. */
const RETRY_WINDOW_MINUTES = 15;

const STATUSES = ['CONNECTED', 'PENDING', 'ERROR'] as const;
type Status = (typeof STATUSES)[number];

async function getConnectors(params: SearchParams) {
  const page = Math.max(1, Number(params.page) || 1);

  const where: Record<string, unknown> = {};
  if (params.orgId) {
    where.organizationId = params.orgId;
  }
  if (STATUSES.includes(params.status as Status)) {
    where.status = params.status;
  }
  if (params.provider) {
    where.provider = params.provider;
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [connectors, total, organizations, providers, counts] =
    await Promise.all([
      prisma.mcpConnector.findMany({
        where,
        // ERROR sorts before CONNECTED and PENDING alphabetically only by
        // accident, so order explicitly on the fault timestamp: a connector
        // with a recent fault is the one somebody is asking about.
        orderBy: [
          { lastErrorAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          organization: { select: { name: true } },
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.mcpConnector.count({ where }),
      prisma.organization.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.mcpConnector
        .groupBy({ by: ['provider'], _count: true })
        .then((rows) => rows.map((row) => row.provider).sort()),
      // Platform-wide rather than filtered: this strip answers "is anything
      // wrong right now", which must not change when a filter is applied.
      Promise.all([
        prisma.mcpConnector.count(),
        prisma.mcpConnector.count({ where: { status: 'CONNECTED' } }),
        prisma.mcpConnector.count({ where: { status: 'ERROR' } }),
        prisma.mcpConnector.count({ where: { status: 'PENDING' } }),
        prisma.mcpConnector.count({
          where: { status: 'ERROR', lastErrorAt: { gte: dayAgo } },
        }),
      ]),
    ]);

  const [all, connected, failing, pending, failingToday] = counts;

  return {
    connectors,
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    organizations,
    providers,
    summary: { all, connected, failing, pending, failingToday },
  };
}

const STATUS_STYLES: Record<string, string> = {
  CONNECTED: 'bg-green-500/10 text-green-600',
  PENDING: 'bg-yellow-500/10 text-yellow-600',
  ERROR: 'bg-destructive/10 text-destructive',
};

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'warn';
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          tone === 'warn' && value > 0 ? 'text-destructive' : ''
        }`}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export default async function ConnectorHealthPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const {
    connectors,
    total,
    page,
    totalPages,
    organizations,
    providers,
    summary,
  } = await getConnectors(params);
  const vaultConfigured = isVaultConfigured();

  const extraParams = {
    orgId: params.orgId,
    status: params.status,
    provider: params.provider,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Connector Health</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{total} shown</span>
          <ExportButton dataset="connectors" extraParams={extraParams} />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        A failing connector is retried on its own about {RETRY_WINDOW_MINUTES}{' '}
        minutes after the fault, so a transient outage clears without anybody
        acting. Forcing a reconnect deletes the stored credential and is for the
        faults that will not clear —{' '}
        <span className="whitespace-nowrap">a revoked</span> authorization, an
        account that no longer exists.
      </p>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="All connectors" value={summary.all} />
        <Stat label="Connected" value={summary.connected} />
        <Stat label="Failing" value={summary.failing} tone="warn" />
        <Stat label="Pending" value={summary.pending} />
        <Stat label="Broke today" value={summary.failingToday} tone="warn" />
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
        <SearchableSelect
          name="status"
          value={params.status}
          placeholder="Any status"
          options={STATUSES.map((status) => ({
            value: status,
            label: status.toLowerCase(),
          }))}
          className="w-40"
        />
        <SearchableSelect
          name="provider"
          value={params.provider}
          placeholder="Any provider"
          options={providers.map((provider) => ({
            value: provider,
            label: provider.toLowerCase(),
          }))}
          className="w-44"
        />
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
              <th className="px-4 py-3 text-left font-medium">Provider</th>
              <th className="px-4 py-3 text-left font-medium">Organization</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Last error</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {connectors.map((connector) => {
              const userLabel =
                connector.user?.email ||
                connector.user?.name ||
                connector.userId;
              return (
                <tr
                  key={connector.id}
                  className="border-b border-border last:border-0 align-top"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium">
                      {connector.provider.toLowerCase()}
                    </span>
                    {!connector.enabled && (
                      <span className="block text-xs text-muted-foreground">
                        switched off by the user
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {connector.organization?.name ?? connector.organizationId}
                    <span className="block text-xs">{userLabel}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[connector.status] ??
                        'bg-secondary text-secondary-foreground'
                      }`}
                    >
                      {connector.status.toLowerCase()}
                    </span>
                    {connector.connectedAt && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        connected{' '}
                        {formatDistanceToNow(new Date(connector.connectedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {connector.lastError ? (
                      <>
                        {/*
                          The reason comes from an MCP server or an OAuth
                          exchange, so it is rendered as text and wrapped.
                          Left unbounded it was a single line that pushed the
                          Actions column off the page.
                        */}
                        <span className="block max-w-md break-words text-xs text-destructive">
                          {connector.lastError}
                        </span>
                        {connector.lastErrorAt && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {formatDistanceToNow(
                              new Date(connector.lastErrorAt),
                              { addSuffix: true },
                            )}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ConnectorHealthActions
                      connectorId={connector.id}
                      provider={connector.provider.toLowerCase()}
                      userLabel={userLabel}
                      vaultConfigured={vaultConfigured}
                    />
                  </td>
                </tr>
              );
            })}
            {connectors.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No connectors found.
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
