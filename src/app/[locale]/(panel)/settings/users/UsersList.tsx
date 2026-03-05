'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { Button } from '@ragenai/common-ui/Button';
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
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
        {t('title')}
      </h2>
      <div>
        <input
          type="text"
          placeholder={t('search')}
          aria-label={t('search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500"
        />
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {filtered.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {t('noResults')}
            </p>
          </div>
        )}
        {filtered.map((u) => (
          <div key={u.id} className="flex items-center gap-3 py-3">
            {/* Avatar */}
            {u.image ? (
              <img
                src={u.image}
                alt={u.name || u.email}
                className="h-9 w-9 shrink-0 rounded-full"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700">
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                  {(u.name || u.email)[0].toUpperCase()}
                </span>
              </div>
            )}

            {/* User info */}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-950 dark:text-white">
                {u.name || u.email}
              </div>
              {u.name && (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {u.email}
                </div>
              )}
            </div>

            {/* Role badge */}
            <span
              className={
                u.role === 'admin'
                  ? 'shrink-0 rounded-md px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  : 'shrink-0 rounded-md px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
              }
            >
              {u.role}
            </span>

            {/* Created date */}
            <span className="hidden shrink-0 text-xs text-zinc-400 sm:block dark:text-zinc-500">
              {new Date(u.createdAt).toLocaleDateString()}
            </span>

            {/* Actions */}
            <div className="shrink-0">
              {u.id !== currentUserId ? (
                <Button
                  onClick={() => handleImpersonate(u.id)}
                  disabled={isPending}
                  className="!px-3 !py-1 !text-xs"
                >
                  {t('impersonate')}
                </Button>
              ) : (
                <div className="w-20" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
