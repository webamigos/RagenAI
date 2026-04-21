'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';

type Props = {
  contentUrl: string;
};

export function MarkdownViewer({ contentUrl }: Props) {
  const t = useTranslations('document-preview');
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

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
      <div className="flex h-full items-center justify-center p-8 text-sm text-red-500">
        {t('error-loading')}
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-gray-500">
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="chat-response h-full overflow-auto p-6">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
