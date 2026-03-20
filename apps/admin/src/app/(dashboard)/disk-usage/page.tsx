import { prisma } from '@/lib/db';
import { SearchableSelect } from '@/app/components/SearchableSelect';
import prettyBytes from 'pretty-bytes';
import { SortableHeader } from '@/app/components/SortableHeader';

export const dynamic = 'force-dynamic';

interface SearchParams {
  orgId?: string;
  sort?: string;
  order?: string;
  search?: string;
}

const BASE_URL = '/disk-usage';

type SortField = 'name' | 'totalSize' | 'fileCount' | 'projects';
const VALID_SORTS: SortField[] = ['name', 'totalSize', 'fileCount', 'projects'];

async function getDiskUsage(params: SearchParams) {
  const sortField = VALID_SORTS.includes(params.sort as SortField)
    ? (params.sort as SortField)
    : 'totalSize';
  const sortOrder = params.order === 'asc' ? 'asc' : 'desc';

  const orgWhere: Record<string, unknown> = {};
  if (params.orgId) {
    orgWhere.id = params.orgId;
  }
  if (params.search) {
    orgWhere.name = { contains: params.search, mode: 'insensitive' };
  }

  const organizations = await prisma.organization.findMany({
    where: orgWhere,
    select: {
      id: true,
      name: true,
      settings: {
        select: { storageLimitBytes: true },
      },
      _count: { select: { projects: true } },
    },
    orderBy: sortField === 'name' ? { name: sortOrder } : { createdAt: 'desc' },
  });

  const fileSizes = await prisma.userFile.groupBy({
    by: ['organizationId'],
    _sum: { fileSize: true },
    _count: true,
  });

  const fileSizeMap = new Map(
    fileSizes.map((f) => [
      f.organizationId,
      { totalSize: f._sum.fileSize ?? 0, fileCount: f._count },
    ]),
  );

  // Compute totals only for filtered organizations
  const filteredOrgIds = new Set(organizations.map((o) => o.id));

  const totalFiles = fileSizes
    .filter((f) => filteredOrgIds.has(f.organizationId))
    .reduce((sum, f) => sum + f._count, 0);
  const totalSize = fileSizes
    .filter((f) => filteredOrgIds.has(f.organizationId))
    .reduce((sum, f) => sum + (f._sum.fileSize ?? 0), 0);

  const orgsWithUsage = organizations
    .map((org) => {
      const usage = fileSizeMap.get(org.id) || { totalSize: 0, fileCount: 0 };
      const limit = org.settings?.storageLimitBytes
        ? Number(org.settings.storageLimitBytes)
        : null;
      return {
        ...org,
        totalSize: usage.totalSize,
        fileCount: usage.fileCount,
        storageLimit: limit,
        usagePercent: limit ? (usage.totalSize / limit) * 100 : null,
      };
    })
    .sort((a, b) => {
      const mul = sortOrder === 'asc' ? 1 : -1;
      if (sortField === 'totalSize') {
        return (a.totalSize - b.totalSize) * mul;
      }
      if (sortField === 'fileCount') {
        return (a.fileCount - b.fileCount) * mul;
      }
      if (sortField === 'projects') {
        return (a._count.projects - b._count.projects) * mul;
      }
      return a.name.localeCompare(b.name) * mul;
    });

  // All orgs for the filter dropdown
  const allOrgs = await prisma.organization.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return { organizations: orgsWithUsage, totalFiles, totalSize, allOrgs };
}

export default async function DiskUsagePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { organizations, totalFiles, totalSize, allOrgs } =
    await getDiskUsage(params);

  const extraParams = {
    orgId: params.orgId,
    search: params.search,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Disk Usage</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Total Storage</p>
          <p className="mt-2 text-3xl font-bold">{prettyBytes(totalSize)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Total Files</p>
          <p className="mt-2 text-3xl font-bold">
            {totalFiles.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Organizations</p>
          <p className="mt-2 text-3xl font-bold">{organizations.length}</p>
        </div>
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="search"
          type="text"
          placeholder="Search organization..."
          defaultValue={params.search}
          className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <SearchableSelect
          name="orgId"
          value={params.orgId}
          placeholder="All organizations"
          options={allOrgs.map((org) => ({ value: org.id, label: org.name }))}
          className="w-56"
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
                label="Organization"
                field="name"
                currentSort={params.sort || 'totalSize'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <SortableHeader
                label="Projects"
                field="projects"
                currentSort={params.sort || 'totalSize'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <SortableHeader
                label="Files"
                field="fileCount"
                currentSort={params.sort || 'totalSize'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-right"
              />
              <SortableHeader
                label="Used"
                field="totalSize"
                currentSort={params.sort || 'totalSize'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-right"
              />
              <th className="px-4 py-3 text-right font-medium">Limit</th>
              <th className="px-4 py-3 text-left font-medium">Usage</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => (
              <tr key={org.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{org.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {org._count.projects}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {org.fileCount.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {prettyBytes(org.totalSize)}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {org.storageLimit
                    ? prettyBytes(org.storageLimit)
                    : 'Unlimited'}
                </td>
                <td className="px-4 py-3">
                  {org.usagePercent !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-secondary">
                        <div
                          className={`h-2 rounded-full ${
                            org.usagePercent > 90
                              ? 'bg-destructive'
                              : org.usagePercent > 70
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                          }`}
                          style={{
                            width: `${Math.min(100, org.usagePercent)}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {org.usagePercent.toFixed(1)}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
            {organizations.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No organizations found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
