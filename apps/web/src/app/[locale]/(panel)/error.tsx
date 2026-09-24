'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { logger } from '@/app/lib/utils/logger';

/**
 * The panel's error boundary.
 *
 * There was none, so any page that threw — a Prisma error on a mistyped id
 * was the one found — fell through to the root and replaced the whole window,
 * sidebar included, with "Application error: a client-side exception". Here
 * the sidebar stays, the page says what happened in the reader's language,
 * and there are two ways on: try again, or start a new chat.
 */
export default function PanelError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations('panel-error');

  useEffect(() => {
    logger.error({ err: error, digest: error.digest }, 'Panel page failed');
  }, [error]);

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 py-24 text-center"
    >
      <ExclamationTriangleIcon className="size-8 text-muted-foreground" />
      <h2 className="text-base font-semibold text-foreground">{t('title')}</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('description')}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button onClick={() => retry()}>{t('retry')}</Button>
        <Button variant="outline" asChild>
          <Link href="/new">{t('new-chat')}</Link>
        </Button>
      </div>
    </div>
  );
}
