'use client';

import { useTranslations } from 'next-intl';

import { snippetToPlainText } from '@/app/components/Assistant/ChatOutput/snippet-text';

/**
 * The cited passage itself, for a source with no document to mark it in.
 *
 * Plain text, the way the source card quotes it: the chunk's Markdown is for
 * the model, and a reader wants the words. Rendered as text, never as HTML —
 * it is document content.
 */
export function CitedPassageQuote({ passage }: { passage: string }) {
  const t = useTranslations('document-preview');
  const text = snippetToPlainText(passage);
  if (!text) {
    return null;
  }
  return (
    <figure className="w-full max-w-2xl text-left">
      <figcaption className="mb-1 text-xs text-muted-foreground">
        {t('cited-passage')}
      </figcaption>
      <blockquote className="rounded-md border border-border bg-card p-4 text-sm text-foreground">
        <mark className="bg-highlight text-highlight-foreground">{text}</mark>
      </blockquote>
    </figure>
  );
}
