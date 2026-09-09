'use client';

import { useTranslations } from 'next-intl';
import { ArrowDownTrayIcon, DocumentIcon } from '@heroicons/react/24/outline';

type Props = {
  fileId: string;
  fileName: string;
};

export function UnsupportedViewer({ fileId, fileName }: Props) {
  const t = useTranslations('document-preview');

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <DocumentIcon className="size-16 text-muted-foreground" />
      <div>
        <p className="text-base font-medium text-foreground">
          {t('unsupported-title')}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('unsupported-description')}
        </p>
      </div>
      <a
        href={`/api/files/${fileId}`}
        download={fileName}
        className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted dark:text-foreground dark:hover:bg-muted"
      >
        <ArrowDownTrayIcon className="size-4" />
        {t('download')}
      </a>
    </div>
  );
}
