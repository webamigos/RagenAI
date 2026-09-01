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
      <DocumentIcon className="size-16 text-gray-300 dark:text-gray-600" />
      <div>
        <p className="text-base font-medium text-gray-700 dark:text-gray-300">
          {t('unsupported-title')}
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('unsupported-description')}
        </p>
      </div>
      <a
        href={`/api/files/${fileId}`}
        download={fileName}
        className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
      >
        <ArrowDownTrayIcon className="size-4" />
        {t('download')}
      </a>
    </div>
  );
}
