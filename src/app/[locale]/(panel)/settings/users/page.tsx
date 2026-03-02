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
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="p-6">
      <UsersList
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role ?? 'user',
          createdAt: u.createdAt.toISOString(),
          image: u.image ?? null,
        }))}
        currentUserId={user.id}
      />
    </div>
  );
}
