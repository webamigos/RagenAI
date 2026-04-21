'use client';

import { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useTranslations } from 'next-intl';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
} from '@heroicons/react/24/outline';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type Props = {
  contentUrl: string;
};

export function PdfViewer({ contentUrl }: Props) {
  const t = useTranslations('document-preview');
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [error, setError] = useState(false);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
      setPageNumber(1);
    },
    [],
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-red-500">
        {t('error-loading')}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            aria-label={t('prev-page')}
            className="rounded p-1 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {t('page')} {pageNumber} {t('of')} {numPages}
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            aria-label={t('next-page')}
            className="rounded p-1 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
            aria-label={t('zoom-out')}
            className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <MagnifyingGlassMinusIcon className="size-4" />
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(3, s + 0.25))}
            aria-label={t('zoom-in')}
            className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <MagnifyingGlassPlusIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900">
        <div className="flex justify-center p-4">
          <Document
            file={contentUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={() => setError(true)}
            loading={
              <div className="flex h-64 items-center justify-center text-sm text-gray-500">
                {t('loading')}
              </div>
            }
          >
            <Page pageNumber={pageNumber} scale={scale} className="shadow-lg" />
          </Document>
        </div>
      </div>
    </div>
  );
}
