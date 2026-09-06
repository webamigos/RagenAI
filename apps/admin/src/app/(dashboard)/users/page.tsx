import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-guard';
import { formatDistanceToNow } from 'date-fns';
import { UserActions } from './components/UserActions';
import { SortableHeader } from '@/app/components/SortableHeader';
import { Pagination } from '@/app/components/Pagination';
import { isAppAdmin } from '@ragenai/platform-contracts';

export const dynamic = 'force-dynamic';

interface SearchParams {
  page?: string;
  search?: string;
  sort?: string;
  order?: string;
}

const PAGE_SIZE = 25;
const BASE_URL = '/users';

type SortField = 'name' | 'email' | 'createdAt';
const VALID_SORTS: SortField[] = ['name', 'email', 'createdAt'];

async function getUsers(params: SearchParams) {
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
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        members: {
          include: { organization: { select: { name: true } } },
        },
        _count: { select: { sessions: true } },
      },
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, totalPages: Math.ceil(total / PAGE_SIZE) };
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // Needed to disable the self-demotion control; the action refuses it anyway.
  const [admin, { users, total, page, totalPages }] = await Promise.all([
    requireAdmin(),
    getUsers(params),
  ]);

  const extraParams = {
    search: params.search,
    sort: params.sort,
    order: params.order,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Users</h1>
        <span className="text-sm text-muted-foreground">{total} total</span>
      </div>

      <form className="flex gap-2">
        <input
          name="search"
          type="text"
          placeholder="Search by name or email..."
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
                label="Email"
                field="email"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Organizations</th>
              <th className="px-4 py-3 text-left font-medium">Sessions</th>
              <SortableHeader
                label="Joined"
                field="createdAt"
                currentSort={params.sort || 'createdAt'}
                currentOrder={params.order || 'desc'}
                baseUrl={BASE_URL}
                extraParams={extraParams}
                className="text-left"
              />
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="w-10 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
              >
                <td className="px-4 py-3 font-medium">
                  <a href={`/users/${user.id}`} className="hover:underline">
                    {user.name || '—'}
                  </a>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      isAppAdmin(user)
                        ? 'rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
                        : 'text-muted-foreground'
                    }
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {user.members.map((m) => m.organization.name).join(', ') ||
                    '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {user._count.sessions}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDistanceToNow(new Date(user.createdAt), {
                    addSuffix: true,
                  })}
                </td>
                <td className="px-4 py-3">
                  {user.banned ? (
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
                  <UserActions
                    userId={user.id}
                    userName={user.name}
                    isBanned={user.banned ?? false}
                    role={user.role}
                    isSelf={user.id === admin.id}
                  />
                </td>
              </tr>
            ))}
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
