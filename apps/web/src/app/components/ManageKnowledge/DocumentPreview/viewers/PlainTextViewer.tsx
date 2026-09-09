'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type Props = {
  contentUrl: string;
};

export function PlainTextViewer({ contentUrl }: Props) {
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
    <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-6 font-mono text-sm text-foreground">
      {text}
    </pre>
  );
}
