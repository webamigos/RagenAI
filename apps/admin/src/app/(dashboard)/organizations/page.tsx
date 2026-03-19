import { prisma } from '@/lib/db';
import { formatDistanceToNow } from 'date-fns';

export const dynamic = 'force-dynamic';

interface SearchParams {
  page?: string;
  search?: string;
}

const PAGE_SIZE = 25;

async function getOrganizations(params: SearchParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search || '';

  const where = search
    ? { name: { contains: search, mode: 'insensitive' as const } }
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
      orderBy: { createdAt: 'desc' },
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
          placeholder="Search by name..."
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

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Slug</th>
              <th className="px-4 py-3 text-left font-medium">Members</th>
              <th className="px-4 py-3 text-left font-medium">Projects</th>
              <th className="px-4 py-3 text-left font-medium">API Keys</th>
              <th className="px-4 py-3 text-left font-medium">Model</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => (
              <tr key={org.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{org.name}</td>
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
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {org.settings?.model || 'default'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDistanceToNow(new Date(org.createdAt), {
                    addSuffix: true,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/organizations?page=${page - 1}${params.search ? `&search=${params.search}` : ''}`}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/organizations?page=${page + 1}${params.search ? `&search=${params.search}` : ''}`}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
