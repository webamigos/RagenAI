'use client';

import { useTranslations } from 'next-intl';
import { EyeIcon } from '@heroicons/react/24/outline';

export function ReadOnlyBanner() {
  const t = useTranslations('assistant.chat');

  return (
    <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground bg-muted/50">
      <EyeIcon className="size-4 shrink-0" />
      <span>{t('read-only-banner')}</span>
    </div>
  );
}
