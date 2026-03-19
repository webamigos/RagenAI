import { prisma } from '@/lib/db';
import { formatDistanceToNow } from 'date-fns';

export const dynamic = 'force-dynamic';

interface SearchParams {
  page?: string;
  search?: string;
}

const PAGE_SIZE = 25;

async function getUsers(params: SearchParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search || '';

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
      orderBy: { createdAt: 'desc' },
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
  const { users, total, page, totalPages } = await getUsers(params);

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

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Organizations</th>
              <th className="px-4 py-3 text-left font-medium">Sessions</th>
              <th className="px-4 py-3 text-left font-medium">Joined</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-3 font-medium">{user.name || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      user.role === 'admin'
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
                href={`/users?page=${page - 1}${params.search ? `&search=${params.search}` : ''}`}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/users?page=${page + 1}${params.search ? `&search=${params.search}` : ''}`}
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
