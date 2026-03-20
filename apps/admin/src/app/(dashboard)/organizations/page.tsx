import { prisma } from '@/lib/db';
import { formatDistanceToNow } from 'date-fns';
import { OrgActions } from './components/OrgActions';
import { SortableHeader } from '@/app/components/SortableHeader';
import { Pagination } from '@/app/components/Pagination';

export const dynamic = 'force-dynamic';

interface SearchParams {
  page?: string;
  search?: string;
  sort?: string;
  order?: string;
}

const PAGE_SIZE = 25;
const BASE_URL = '/organizations';

type SortField = 'name' | 'slug' | 'createdAt';
const VALID_SORTS: SortField[] = ['name', 'slug', 'createdAt'];

async function getOrganizations(params: SearchParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search || '';

  const sortField = VALID_SORTS.includes(params.sort as SortField)
    ? (params.sort as SortField)
    : 'createdAt';
  const sortOrder = params.order === 'asc' ? 'asc' : 'desc';

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { slug: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      include: {
        _count: {
          select: {
            members: true,
            projects: true,
            apiKeys: true,
          },
        },
        settings: {
          select: {
            model: true,
            storageLimitBytes: true,
            monthlyTokenLimit: true,
          },
        },
      },
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.organization.count({ where }),
  ]);

  return {
    organizations,
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { organizations, total, page, totalPages } =
    await getOrganizations(params);

  const extraParams = {
    search: params.search,
    sort: params.sort,
    order: params.order,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Organizations</h1>
        <span className="text-sm text-muted-foreground">{total} total</span>
      </div>

      <form className="flex gap-2">
        <input
          name="search"
          type="text"
          placeholder="Search by name or slug..."
          defaultValue={params.search}
          className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Search
        </button>
      </form>

      <div className="rounded-lg border border-border">
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
              <SortableHeader
                label="Slug"
                field="slug"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <th className="px-4 py-3 text-left font-medium">Members</th>
              <th className="px-4 py-3 text-left font-medium">Projects</th>
              <th className="px-4 py-3 text-left font-medium">API Keys</th>
              <th className="px-4 py-3 text-left font-medium">Model</th>
              <SortableHeader
                label="Created"
                field="createdAt"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <th className="w-10 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => (
              <tr
                key={org.id}
                className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
              >
                <td className="px-4 py-3 font-medium">
                  <a
                    href={`/organizations/${org.id}`}
                    className="hover:underline"
                  >
                    {org.name}
                  </a>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {org.slug || '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {org._count.members}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {org._count.projects}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {org._count.apiKeys}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {org.settings?.model || 'default'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDistanceToNow(new Date(org.createdAt), {
                    addSuffix: true,
                  })}
                </td>
                <td className="px-4 py-3">
                  <OrgActions
                    orgId={org.id}
                    orgName={org.name}
                    orgSlug={org.slug}
                  />
                </td>
              </tr>
            ))}
            {organizations.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No organizations found.
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
