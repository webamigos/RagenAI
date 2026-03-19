'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { Dialog, DialogTitle, DialogActions } from '@ragenai/common-ui/Dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import {
  impersonateUserAction,
  banUserAction,
  unbanUserAction,
  renameUserAction,
  createUserAction,
} from './actions';
import { useSession } from '@/app/hooks/use-better-auth';

type User = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  image: string | null;
  banned: boolean;
  banReason: string | null;
  organizationName: string | null;
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

  // Rename dialog state
  const [renameTarget, setRenameTarget] = useState<User | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Ban dialog state
  const [banTarget, setBanTarget] = useState<User | null>(null);
  const [banReason, setBanReason] = useState('');

  // Unban dialog state
  const [unbanTarget, setUnbanTarget] = useState<User | null>(null);

  // Create user dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
  });

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

  const handleRename = () => {
    if (!renameTarget || !renameValue.trim()) {
      return;
    }
    startTransition(async () => {
      try {
        await renameUserAction(renameTarget.id, renameValue.trim());
        toast.success(t('renameSuccess'));
        setRenameTarget(null);
        router.refresh();
      } catch {
        toast.error(t('renameError'));
      }
    });
  };

  const handleBan = () => {
    if (!banTarget) {
      return;
    }
    startTransition(async () => {
      try {
        await banUserAction(banTarget.id, banReason || undefined);
        toast.success(t('banSuccess'));
        setBanTarget(null);
        setBanReason('');
        router.refresh();
      } catch {
        toast.error(t('banError'));
      }
    });
  };

  const handleUnban = () => {
    if (!unbanTarget) {
      return;
    }
    startTransition(async () => {
      try {
        await unbanUserAction(unbanTarget.id);
        toast.success(t('unbanSuccess'));
        setUnbanTarget(null);
        router.refresh();
      } catch {
        toast.error(t('unbanError'));
      }
    });
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.email.trim() || !createForm.password.trim()) {
      return;
    }
    startTransition(async () => {
      try {
        await createUserAction({
          name: createForm.name.trim(),
          email: createForm.email.trim(),
          password: createForm.password,
          role: createForm.role as 'admin' | 'user',
        });
        toast.success(t('createSuccess'));
        setIsCreateOpen(false);
        setCreateForm({ name: '', email: '', password: '', role: 'user' });
        router.refresh();
      } catch {
        toast.error(t('createError'));
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {t('title')}
        </h2>
        <Button onClick={() => setIsCreateOpen(true)}>{t('createUser')}</Button>
      </div>

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
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-950 dark:text-white">
                  {u.name || u.email}
                </span>
                {u.banned && (
                  <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    {t('banned')}
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {u.name ? u.email : ''}
                {u.organizationName && (
                  <span>
                    {u.name ? ' · ' : ''}
                    {u.organizationName}
                  </span>
                )}
              </div>
            </div>

            {/* Role badge */}
            <span
              className={
                u.role === 'admin'
                  ? 'shrink-0 rounded-md px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                  : 'shrink-0 rounded-md px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
              }
            >
              {u.role}
            </span>

            {/* Created date */}
            <span className="hidden shrink-0 text-xs text-zinc-400 sm:block dark:text-zinc-500">
              {new Date(u.createdAt).toLocaleDateString()}
            </span>

            {/* Actions - three dots menu */}
            <div className="shrink-0">
              {u.id !== currentUserId ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded p-1 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    >
                      <EllipsisHorizontalIcon className="size-5 text-zinc-500 dark:text-zinc-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameTarget(u);
                        setRenameValue(u.name || '');
                      }}
                    >
                      {t('rename')}
                    </DropdownMenuItem>
                    {u.banned ? (
                      <DropdownMenuItem onClick={() => setUnbanTarget(u)}>
                        {t('unban')}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => setBanTarget(u)}>
                        {t('ban')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleImpersonate(u.id)}
                      disabled={isPending}
                    >
                      {t('impersonate')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="w-7" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Rename dialog */}
      <Dialog
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        size="sm"
      >
        <DialogTitle>{t('renameTitle')}</DialogTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRename();
          }}
          className="mt-4 space-y-4"
        >
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder={t('namePlaceholder')}
            disabled={isPending}
          />
          <DialogActions>
            <Button
              plain
              onClick={() => setRenameTarget(null)}
              disabled={isPending}
            >
              {t('cancel')}
            </Button>
            <Button
              isSubmit
              disabled={isPending || !renameValue.trim()}
              isLoading={isPending}
            >
              {t('save')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Ban dialog */}
      <AlertDialog
        open={!!banTarget}
        onOpenChange={(open) => {
          if (!open) {
            setBanTarget(null);
            setBanReason('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('banTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('banConfirm', {
                name: banTarget?.name || banTarget?.email || '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-0">
            <Input
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder={t('banReasonPlaceholder')}
              disabled={isPending}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBan}
              disabled={isPending}
              className="border-red-300 bg-transparent text-red-600 hover:bg-red-600 hover:text-white dark:border-red-700 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white"
            >
              {t('ban')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unban dialog */}
      <AlertDialog
        open={!!unbanTarget}
        onOpenChange={(open) => {
          if (!open) {
            setUnbanTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('unbanTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('unbanConfirm', {
                name: unbanTarget?.name || unbanTarget?.email || '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleUnban} disabled={isPending}>
              {t('unban')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create user dialog */}
      <Dialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        size="md"
      >
        <DialogTitle>{t('createUser')}</DialogTitle>
        <form onSubmit={handleCreateUser} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="create-name"
              className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {t('name')}
            </label>
            <Input
              id="create-name"
              value={createForm.name}
              onChange={(e) =>
                setCreateForm((p) => ({ ...p, name: e.target.value }))
              }
              placeholder={t('namePlaceholder')}
              disabled={isPending}
            />
          </div>
          <div>
            <label
              htmlFor="create-email"
              className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {t('email')}
            </label>
            <Input
              id="create-email"
              type="email"
              value={createForm.email}
              onChange={(e) =>
                setCreateForm((p) => ({ ...p, email: e.target.value }))
              }
              placeholder={t('emailPlaceholder')}
              disabled={isPending}
            />
          </div>
          <div>
            <label
              htmlFor="create-password"
              className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {t('password')}
            </label>
            <Input
              id="create-password"
              type="password"
              value={createForm.password}
              onChange={(e) =>
                setCreateForm((p) => ({ ...p, password: e.target.value }))
              }
              placeholder={t('passwordPlaceholder')}
              disabled={isPending}
            />
          </div>
          <div>
            <label
              htmlFor="create-role"
              className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {t('role')}
            </label>
            <select
              id="create-role"
              value={createForm.role}
              onChange={(e) =>
                setCreateForm((p) => ({ ...p, role: e.target.value }))
              }
              disabled={isPending}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              plain
              onClick={() => setIsCreateOpen(false)}
              disabled={isPending}
            >
              {t('cancel')}
            </Button>
            <Button
              isSubmit
              disabled={
                isPending ||
                !createForm.email.trim() ||
                !createForm.password.trim()
              }
              isLoading={isPending}
            >
              {t('createUser')}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
