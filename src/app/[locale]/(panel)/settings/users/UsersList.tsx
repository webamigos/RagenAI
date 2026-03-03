'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { impersonateUserAction } from './actions';
import { useSession } from '@/app/hooks/use-better-auth';

type User = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  image: string | null;
};

type Props = {
  users: User[];
  currentUserId: string;
};

export function UsersList({ users, currentUserId }: Props) {
  const t = useTranslations('admin.users');
  const router = useRouter();
  const { refetch } = useSession();
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  });

  const handleImpersonate = (userId: string) => {
    startTransition(async () => {
      try {
        await impersonateUserAction(userId);
        await refetch();
        router.push('/new');
        router.refresh();
      } catch {
        toast.error(t('impersonateError'));
      }
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('title')}
        </h1>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder={t('search')}
          aria-label={t('search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-zinc-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-zinc-700">
          <thead className="bg-gray-50 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t('name')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t('email')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t('role')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t('created')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-zinc-700 dark:bg-zinc-900">
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  {t('noResults')}
                </td>
              </tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id}>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                  {u.name || '-'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  {u.email}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <span
                    className={
                      u.role === 'admin'
                        ? 'inline-flex rounded-full bg-purple-100 px-2 text-xs font-semibold leading-5 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                        : 'inline-flex rounded-full bg-gray-100 px-2 text-xs font-semibold leading-5 text-gray-800 dark:bg-zinc-700 dark:text-gray-200'
                    }
                  >
                    {u.role}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                  {u.id !== currentUserId && (
                    <button
                      onClick={() => handleImpersonate(u.id)}
                      disabled={isPending}
                      className="rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('impersonate')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
