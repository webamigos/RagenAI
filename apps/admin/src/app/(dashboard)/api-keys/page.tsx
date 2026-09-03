import { formatDistanceToNow } from 'date-fns';

import { ExportButton } from '@/app/components/ExportButton';
import { Pagination } from '@/app/components/Pagination';
import { SearchableSelect } from '@/app/components/SearchableSelect';
import { SortableHeader } from '@/app/components/SortableHeader';
import { prisma } from '@/lib/db';
import { isVaultConfigured } from '@/lib/vault';

import { ApiKeyActions } from './ApiKeyActions';

export const dynamic = 'force-dynamic';

/**
 * Every API key on the platform, and what can be done about one.
 *
 * Support could see that an organization *had* keys — the organization page
 * counts them — but not which, nor whether any had ever been used. `lastUsedAt`
 * is the clearest example: `ApiKeyGuard` has written that column on every
 * authenticated request since the public API shipped, and **no query anywhere
 * read it**. A key nobody has ever called is the one worth withdrawing, and
 * until now that was invisible.
 */

interface SearchParams {
  page?: string;
  search?: string;
  orgId?: string;
  status?: string;
  sort?: string;
  order?: string;
}

const PAGE_SIZE = 25;
const BASE_URL = '/api-keys';
const STALE_DAYS = 90;

type SortField = 'createdAt' | 'lastUsedAt' | 'name';
const VALID_SORTS: SortField[] = ['createdAt', 'lastUsedAt', 'name'];

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function getApiKeys(params: SearchParams) {
  const page = Math.max(1, Number(params.page) || 1);

  const sortField = VALID_SORTS.includes(params.sort as SortField)
    ? (params.sort as SortField)
    : 'createdAt';
  const sortOrder = params.order === 'asc' ? 'asc' : 'desc';

  const where: Record<string, unknown> = {};
  if (params.orgId) {
    where.organizationId = params.orgId;
  }
  if (params.status === 'active') {
    where.isActive = true;
  }
  if (params.status === 'inactive') {
    where.isActive = false;
  }
  if (params.status === 'never-used') {
    where.lastUsedAt = null;
  }
  if (params.status === 'debug') {
    where.debugMode = true;
  }
  if (params.search) {
    where.name = { contains: params.search, mode: 'insensitive' };
  }

  const stale = daysAgo(STALE_DAYS);

  const [keys, total, organizations, counts] = await Promise.all([
    prisma.apiKey.findMany({
      where,
      // `lastUsedAt` is nullable and a never-used key is the most interesting
      // row on the page, so nulls sort first when reading by last use rather
      // than being buried at the end.
      orderBy:
        sortField === 'lastUsedAt'
          ? { lastUsedAt: { sort: sortOrder, nulls: 'first' } }
          : { [sortField]: sortOrder },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        organization: { select: { name: true } },
        project: { select: { title: true } },
      },
    }),
    prisma.apiKey.count({ where }),
    prisma.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    // Platform-wide, not filtered: this strip is the reason to open the page,
    // so it has to say what is out there rather than what is on screen.
    Promise.all([
      prisma.apiKey.count(),
      prisma.apiKey.count({ where: { isActive: true } }),
      prisma.apiKey.count({ where: { lastUsedAt: null } }),
      prisma.apiKey.count({
        where: { lastUsedAt: { lt: stale } },
      }),
      prisma.apiKey.count({ where: { debugMode: true } }),
    ]),
  ]);

  // `createdBy` holds a user id with no relation declared, so the names come
  // from one extra read rather than a join.
  const creatorIds = [
    ...new Set(keys.map((key) => key.createdBy).filter(Boolean)),
  ] as string[];
  const creators = creatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const creatorMap = new Map(
    creators.map((user) => [user.id, user.email || user.name]),
  );

  const [allKeys, activeKeys, neverUsed, staleKeys, debugKeys] = counts;

  return {
    keys: keys.map((key) => ({
      ...key,
      organizationName: key.organization?.name ?? null,
      projectName: key.project?.title ?? null,
      creatorLabel: key.createdBy
        ? creatorMap.get(key.createdBy) || key.createdBy
        : null,
    })),
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    organizations,
    summary: { allKeys, activeKeys, neverUsed, staleKeys, debugKeys },
  };
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'active' },
  { value: 'inactive', label: 'deactivated' },
  { value: 'never-used', label: 'never used' },
  { value: 'debug', label: 'debug mode on' },
];

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

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { keys, total, page, totalPages, organizations, summary } =
    await getApiKeys(params);
  const vaultConfigured = isVaultConfigured();

  const extraParams = {
    search: params.search,
    orgId: params.orgId,
    status: params.status,
    sort: params.sort,
    order: params.order,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">API Keys</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{total} shown</span>
          <ExportButton dataset="api-keys" extraParams={extraParams} />
        </div>
      </div>

      {!vaultConfigured && (
        <p
          role="status"
          className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
        >
          The token vault is not configured on this app, so a key&rsquo;s secret
          cannot be destroyed from here. Deactivating still stops a key working
          — <code>ApiKeyGuard</code> rejects an inactive key before it checks
          the vault. Set <code>RAGEN_TOKEN_VAULT_URL</code> and{' '}
          <code>RAGEN_TOKEN_VAULT_SERVICE_SECRET</code> to enable revoking.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="All keys" value={summary.allKeys} />
        <Stat label="Active" value={summary.activeKeys} />
        <Stat label="Never used" value={summary.neverUsed} tone="warn" />
        <Stat
          label={`Last used > ${STALE_DAYS}d ago`}
          value={summary.staleKeys}
          tone="warn"
        />
        <Stat label="Debug mode" value={summary.debugKeys} tone="warn" />
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="search"
          type="text"
          placeholder="Search by key name..."
          defaultValue={params.search}
          className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
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
          placeholder="Any state"
          options={STATUS_OPTIONS}
          className="w-44"
        />
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
                label="Name"
                field="name"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <th className="px-4 py-3 text-left font-medium">Key</th>
              <th className="px-4 py-3 text-left font-medium">Organization</th>
              <th className="px-4 py-3 text-left font-medium">State</th>
              <SortableHeader
                label="Created"
                field="createdAt"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <SortableHeader
                label="Last used"
                field="lastUsedAt"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <span className="font-medium">{key.name}</span>
                  {key.creatorLabel && (
                    <span className="block text-xs text-muted-foreground">
                      by {key.creatorLabel}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                  {key.maskedValue || '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {key.organizationName ?? (
                    /* onDelete: SetNull, so a key can outlive its org. */
                    <span className="text-destructive">org deleted</span>
                  )}
                  {key.projectName && (
                    <span className="block text-xs">{key.projectName}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        key.isActive
                          ? 'bg-green-500/10 text-green-600'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {key.isActive ? 'active' : 'deactivated'}
                    </span>
                    {key.debugMode && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        debug
                      </span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatDistanceToNow(new Date(key.createdAt), {
                    addSuffix: true,
                  })}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {key.lastUsedAt ? (
                    formatDistanceToNow(new Date(key.lastUsedAt), {
                      addSuffix: true,
                    })
                  ) : (
                    <span className="text-destructive">never</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <ApiKeyActions
                    apiKeyId={key.id}
                    name={key.name}
                    isActive={key.isActive}
                    vaultConfigured={vaultConfigured}
                  />
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No API keys found.
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
