'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { findPassage } from '../passage/find-passage';
import {
  PASSAGE_MARK_CLASS,
  scrollPassageIntoView,
} from '../passage/highlight-in-element';
import { PassageNotFoundHint } from '../passage/PassageNotFoundHint';

type Props = {
  contentUrl: string;
  /**
   * The passage a citation quoted, to mark and scroll to. Absent when the
   * file is opened from the knowledge base rather than from a source.
   */
  passage?: string;
};

export function PlainTextViewer({ contentUrl, passage }: Props) {
  const t = useTranslations('document-preview');
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!contentUrl) {
      return;
    }
    setText(null);
    setError(false);
    fetch(contentUrl)
      .then((res) => {
        if (!res.ok) {
          throw new Error('fetch failed');
        }
        return res.text();
      })
      .then(setText)
      .catch(() => setError(true));
  }, [contentUrl]);

  // Plain text is rendered by this component, so the mark is part of the
  // render rather than DOM surgery afterwards.
  const match = useMemo(
    () => (text !== null && passage ? findPassage(text, passage) : null),
    [text, passage],
  );
  const markRef = useRef<HTMLElement>(null);
  useEffect(() => {
    scrollPassageIntoView(markRef.current);
  }, [match]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-destructive">
        {t('error-loading')}
      </div>
    );
  }

  if (text === null) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {passage && !match ? <PassageNotFoundHint /> : null}
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-6 font-mono text-sm text-foreground">
        {match ? (
          <>
            {text.slice(0, match.start)}
            <mark ref={markRef} className={PASSAGE_MARK_CLASS}>
              {text.slice(match.start, match.end)}
            </mark>
            {text.slice(match.end)}
          </>
        ) : (
          text
        )}
      </pre>
    </div>
  );
}
