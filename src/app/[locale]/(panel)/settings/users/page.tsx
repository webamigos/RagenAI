import type { Metadata } from 'next';
import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { isAppAdmin } from '@/lib/auth-access-control';
import db from '@ragenai/prisma-client';
import { UsersList } from './UsersList';

export const metadata: Metadata = {
  title: 'Users',
};

export default async function UsersPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

  if (!user) {
    return redirect({ href: '/sign-in', locale });
  }

  if (!isAppAdmin(user)) {
    return redirect({ href: '/', locale });
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      image: true,
      banned: true,
      banReason: true,
      members: {
        select: {
          organization: {
            select: { name: true },
          },
        },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="max-w-2xl">
      <UsersList
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role ?? 'user',
          createdAt: u.createdAt.toISOString(),
          image: u.image ?? null,
          banned: u.banned ?? false,
          banReason: u.banReason ?? null,
          organizationName: u.members[0]?.organization?.name ?? null,
        }))}
        currentUserId={user.id}
      />
    </div>
  );
}
