import { prisma } from '@/lib/db';
import { SearchableSelect } from '@/app/components/SearchableSelect';
import { formatDistanceToNow } from 'date-fns';
import { SortableHeader } from '@/app/components/SortableHeader';
import { Pagination } from '@/app/components/Pagination';

export const dynamic = 'force-dynamic';

interface SearchParams {
  page?: string;
  search?: string;
  status?: string;
  orgId?: string;
  sort?: string;
  order?: string;
}

const PAGE_SIZE = 25;
const BASE_URL = '/invitations';

type SortField = 'createdAt' | 'expiresAt' | 'email' | 'status' | 'role';
const VALID_SORTS: SortField[] = [
  'createdAt',
  'expiresAt',
  'email',
  'status',
  'role',
];

async function getInvitations(params: SearchParams) {
  const page = Math.max(1, Number(params.page) || 1);

  const sortField = VALID_SORTS.includes(params.sort as SortField)
    ? (params.sort as SortField)
    : 'createdAt';
  const sortOrder = params.order === 'asc' ? 'asc' : 'desc';

  const where: Record<string, unknown> = {};
  if (params.status) {
    where.status = params.status;
  }
  if (params.orgId) {
    where.organizationId = params.orgId;
  }
  if (params.search) {
    where.email = { contains: params.search, mode: 'insensitive' };
  }

  const [invitations, total, organizations, statuses] = await Promise.all([
    prisma.invitation.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.invitation.count({ where }),
    prisma.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.invitation
      .groupBy({ by: ['status'], _count: true, orderBy: { status: 'asc' } })
      .then((r) => r.map((s) => s.status)),
  ]);

  // Reuse already-fetched organizations for display names
  const orgMap = new Map(organizations.map((o) => [o.id, o.name]));

  // Fetch inviter names
  const inviterIds = [
    ...new Set(invitations.map((i) => i.inviterId).filter(Boolean)),
  ] as string[];
  const inviters = inviterIds.length
    ? await prisma.user.findMany({
        where: { id: { in: inviterIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const inviterMap = new Map(inviters.map((u) => [u.id, u.name || u.email]));

  return {
    invitations: invitations.map((inv) => ({
      ...inv,
      organizationName: orgMap.get(inv.organizationId) || inv.organizationId,
      inviterName: inv.inviterId
        ? inviterMap.get(inv.inviterId) || inv.inviterId
        : null,
    })),
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    organizations,
    statuses,
  };
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600',
  accepted: 'bg-green-500/10 text-green-600',
  rejected: 'bg-destructive/10 text-destructive',
  canceled: 'bg-muted text-muted-foreground',
};

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { invitations, total, page, totalPages, organizations, statuses } =
    await getInvitations(params);

  const extraParams = {
    search: params.search,
    status: params.status,
    orgId: params.orgId,
    sort: params.sort,
    order: params.order,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Invitations</h1>
        <span className="text-sm text-muted-foreground">{total} total</span>
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="search"
          type="text"
          placeholder="Search by email..."
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
          placeholder="All statuses"
          options={statuses.map((s) => ({ value: s, label: s }))}
          className="w-40"
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
                label="Email"
                field="email"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <th className="px-4 py-3 text-left font-medium">Organization</th>
              <SortableHeader
                label="Role"
                field="role"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <SortableHeader
                label="Status"
                field="status"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <th className="px-4 py-3 text-left font-medium">Invited by</th>
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
                label="Expires"
                field="expiresAt"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => {
              const isExpired = new Date(inv.expiresAt) < new Date();
              return (
                <tr
                  key={inv.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3 font-medium">{inv.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {inv.organizationName}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                      {inv.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        isExpired && inv.status === 'pending'
                          ? 'bg-destructive/10 text-destructive'
                          : statusColors[inv.status] ||
                            'bg-secondary text-secondary-foreground'
                      }`}
                    >
                      {isExpired && inv.status === 'pending'
                        ? 'expired'
                        : inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {inv.inviterName || '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDistanceToNow(new Date(inv.createdAt), {
                      addSuffix: true,
                    })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {isExpired ? (
                      <span className="text-destructive">Expired</span>
                    ) : (
                      formatDistanceToNow(new Date(inv.expiresAt), {
                        addSuffix: true,
                      })
                    )}
                  </td>
                </tr>
              );
            })}
            {invitations.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No invitations found.
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
