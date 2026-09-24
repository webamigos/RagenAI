'use client';

import { useTranslations } from 'next-intl';
import { ArrowDownTrayIcon, DocumentIcon } from '@heroicons/react/24/outline';

import { CitedPassageQuote } from './CitedPassageQuote';

type Props = {
  fileId: string;
  fileName: string;
  /**
   * The passage a citation quoted. A format with no preview can still show
   * the words the answer relied on, which is most of what a reader opening
   * a source wants.
   */
  passage?: string;
};

export function UnsupportedViewer({ fileId, fileName, passage }: Props) {
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
        className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-paper-200 dark:bg-paper-700 dark:hover:bg-paper-600"
      >
        <ArrowDownTrayIcon className="size-4" />
        {t('download')}
      </a>
      {passage ? <CitedPassageQuote passage={passage} /> : null}
    </div>
  );
}
