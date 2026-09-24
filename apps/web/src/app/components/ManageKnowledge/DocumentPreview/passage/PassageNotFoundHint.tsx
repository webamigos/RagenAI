'use client';

import { useTranslations } from 'next-intl';

/**
 * Said when a source opened and its passage could not be found in it.
 *
 * A hint, not an error: the document is still the right one, and the reasons
 * are ordinary — the file was replaced since the answer, the passage was
 * mostly a table, the quote was cut at 2,000 characters mid-word. The reader
 * still gets the document; they just have to find the place themselves.
 */
export function PassageNotFoundHint() {
  const t = useTranslations('document-preview');
  return (
    <p
      role="status"
      data-testid="passage-not-found"
      className="shrink-0 border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground"
    >
      {t('passage-not-found')}
    </p>
  );
}
