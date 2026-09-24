'use client';

import { useTranslations } from 'next-intl';
import {
  ArrowTopRightOnSquareIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';

import { CitedPassageQuote } from './CitedPassageQuote';

/**
 * The page a scraped source came from, read out of its stored name.
 *
 * The scraper names the row `<url> | <mode>` (`scrape-website.ts`), and that
 * name is all a cited source carries. Only `http:` and `https:` come back: the
 * value ends up in an `href`, and a `javascript:` URL in a document name must
 * not become a link anybody can click.
 */
export function urlFromSourceName(fileName: string): string | null {
  const candidate = fileName.split(' | ')[0]?.trim();
  if (!candidate) {
    return null;
  }
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

type Props = {
  url: string;
  passage?: string;
};

/**
 * A cited web page: the quoted passage, and a link to the page itself.
 *
 * The page is not embedded. Most sites refuse to be framed, and the copy we
 * indexed may no longer be what the site serves — the quote is what the
 * answer read, so it is shown as ours and the live page as theirs.
 */
export function UrlSourceViewer({ url, passage }: Props) {
  const t = useTranslations('document-preview');
  return (
    <div className="flex h-full flex-col items-center gap-4 overflow-auto p-8 text-center">
      <GlobeAltIcon className="size-12 text-muted-foreground" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-paper-200 dark:bg-paper-700 dark:hover:bg-paper-600"
      >
        <ArrowTopRightOnSquareIcon className="size-4" />
        {t('open-original-page')}
      </a>
      <p
        className="max-w-2xl truncate text-xs text-muted-foreground"
        title={url}
      >
        {url}
      </p>
      {passage ? <CitedPassageQuote passage={passage} /> : null}
    </div>
  );
}
