'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useUser } from '@/app/hooks/use-auth';
import { useSession } from '@/app/hooks/use-better-auth';
import { updateProfile } from '../../../user/profile/actions/user';
import { statusToast } from '@/app/lib/utils/toast';

export function ProfileSection() {
  const t = useTranslations('settings-page.general');
  const { user } = useUser();
  const { refetch } = useSession();
  const router = useRouter();
  const { successToast, errorToast } = statusToast();

  const [displayName, setDisplayName] = useState(user?.name || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user?.name !== undefined) {
      setDisplayName(user.name);
    }
  }, [user?.name]);

  const isDirty = displayName !== (user?.name || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDirty || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateProfile(displayName);
      if (result.success) {
        successToast({ message: t('profile-success') });
        await refetch();
        router.refresh();
      } else {
        errorToast({ message: result.error || t('profile-error') });
      }
    } catch {
      errorToast({ message: t('profile-error') });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section>
      <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
        {t('profile')}
      </h2>
      <form onSubmit={handleSubmit} className="mt-4 flex items-end gap-3">
        <div className="flex-1 max-w-sm">
          <label
            htmlFor="display-name"
            className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1.5"
          >
            {t('display-name')}
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('display-name-placeholder')}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
          />
        </div>
        <button
          type="submit"
          disabled={!isDirty || isSubmitting}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isSubmitting ? t('profile-saving') : t('profile-save')}
        </button>
      </form>
    </section>
  );
}
