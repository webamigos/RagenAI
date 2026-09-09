'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import mammoth from 'mammoth';
import DOMPurify from 'dompurify';

type Props = {
  contentUrl: string;
};

export function DocxViewer({ contentUrl }: Props) {
  const t = useTranslations('document-preview');
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

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
    <div
      className="chat-response h-full overflow-auto p-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
