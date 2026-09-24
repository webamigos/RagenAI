'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';

/*
  The `chat-response` class below only does anything if this stylesheet is in
  the build, and a class name is not an import. It reached this drawer only
  because a sibling in the same bundle happened to import it, which is not a
  dependency anybody declared and not one that survives that sibling moving.
*/
import '@/app/components/Assistant/ChatOutput/chat-response.css';

import { usePassageHighlight } from '../passage/use-passage-highlight';
import { PassageNotFoundHint } from '../passage/PassageNotFoundHint';

type Props = {
  contentUrl: string;
  /** The passage a citation quoted, to mark and scroll to. */
  passage?: string;
};

export function MarkdownViewer({ contentUrl, passage }: Props) {
  const t = useTranslations('document-preview');
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Marked after React has rendered the Markdown, in the rendered text: the
  // source's `**` and `#` are exactly what the reader does not see.
  const status = usePassageHighlight(bodyRef, passage, content);

  // Memoised so a re-render — the highlight's own "found" state is one —
  // leaves the rendered Markdown, and the marks inside it, alone.
  const body = useMemo(
    () =>
      content === null ? null : (
        <div
          ref={bodyRef}
          className="chat-response min-h-0 flex-1 overflow-auto p-6"
        >
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      ),
    [content],
  );

  useEffect(() => {
    if (!contentUrl) {
      return;
    }
    setContent(null);
    setError(false);
    fetch(contentUrl)
      .then((res) => {
        if (!res.ok) {
          throw new Error('fetch failed');
        }
        return res.text();
      })
      .then(setContent)
      .catch(() => setError(true));
  }, [contentUrl]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-destructive">
        {t('error-loading')}
      </div>
    );
  }

  if (content === null) {
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
