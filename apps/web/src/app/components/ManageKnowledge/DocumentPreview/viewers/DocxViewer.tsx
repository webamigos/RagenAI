'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import mammoth from 'mammoth';
import DOMPurify from 'dompurify';

// The `chat-response` class below is styling, and a class name is not an
// import: without this the pane renders unstyled wherever nothing else in
// the bundle happens to pull the stylesheet in.
import '@/app/components/Assistant/ChatOutput/chat-response.css';

import { usePassageHighlight } from '../passage/use-passage-highlight';
import { PassageNotFoundHint } from '../passage/PassageNotFoundHint';

type Props = {
  contentUrl: string;
  /**
   * The passage a citation quoted, to mark and scroll to. A DOCX has no
   * pages to open at — mammoth renders it as one flowing document — so the
   * passage is what takes the reader to the right place.
   */
  passage?: string;
};

export function DocxViewer({ contentUrl, passage }: Props) {
  const t = useTranslations('document-preview');
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const status = usePassageHighlight(bodyRef, passage, html);

  /**
   * The same element for as long as the HTML is the same, so React skips
   * this subtree on a re-render instead of writing `innerHTML` again — which
   * it does, and which silently wipes the `<mark>`s the highlight added the
   * moment the "found" state re-renders the viewer.
   */
  const body = useMemo(
    () =>
      html === null ? null : (
        <div
          ref={bodyRef}
          className="chat-response min-h-0 flex-1 overflow-auto p-6"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ),
    [html],
  );

  useEffect(() => {
    if (!contentUrl) {
      return;
    }
    setHtml(null);
    setError(false);
    fetch(contentUrl)
      .then((res) => {
        if (!res.ok) {
          throw new Error('fetch failed');
        }
        return res.arrayBuffer();
      })
      .then((buf) => mammoth.convertToHtml({ arrayBuffer: buf }))
      .then((result) => setHtml(DOMPurify.sanitize(result.value)))
      .catch(() => setError(true));
  }, [contentUrl]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-destructive">
        {t('error-loading')}
      </div>
    );
  }

  if (html === null) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {status === 'not-found' ? <PassageNotFoundHint /> : null}
      {body}
    </div>
  );
}
