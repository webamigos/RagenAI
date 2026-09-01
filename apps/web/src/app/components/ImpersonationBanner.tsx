'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useSession } from '@/app/hooks/use-better-auth';
import { stopImpersonationAction } from '@/app/actions/impersonation';
import { useTransition } from 'react';
import { statusToast } from '@/app/lib/utils/toast';

export function ImpersonationBanner() {
  const t = useTranslations('impersonation');
  const router = useRouter();
  const { data: session, refetch } = useSession();
  const [isPending, startTransition] = useTransition();
  const { errorToast } = statusToast();

  // @ts-ignore - Better Auth types don't expose impersonatedBy yet
  const impersonatedBy = session?.session?.impersonatedBy as string | undefined;

  if (!impersonatedBy) {
    return null;
  }

  const userName = session?.user?.name || session?.user?.email || '';

  const handleStop = () => {
    startTransition(async () => {
      try {
        await stopImpersonationAction();
        await refetch();
        router.push('/new');
        router.refresh();
      } catch {
        errorToast({ message: t('stop-error') });
      }
    });
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-md">
      <span>{t('banner', { name: userName })}</span>
      <button
        onClick={handleStop}
        disabled={isPending}
        className="rounded bg-white px-3 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
      >
        {t('stop')}
      </button>
    </div>
  );
}
