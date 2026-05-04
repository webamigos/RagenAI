'use client';

import { useMemo } from 'react';
// @ts-ignore -- UMD bundle has no type declarations
import MarkdownIt from 'markdown-it/dist/markdown-it.js';
import DOMPurify from 'dompurify';
import { MarkdownWithMermaid } from '@/app/components/Assistant/ChatOutput/MarkdownWithMermaid';
import '@/app/components/Assistant/ChatOutput/chat-response.css';

type Props = {
  content: string;
};

export function MarkdownMessage({ content }: Props) {
  const md = useMemo(() => new MarkdownIt({ linkify: true, breaks: true }), []);

  const renderAndSanitize = useMemo(
    () => (markdown: string) =>
      DOMPurify.sanitize(md.render(markdown), {
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
      }),
    [md],
  );

  return (
    <MarkdownWithMermaid
      content={content}
      renderAndSanitize={renderAndSanitize}
      className="chat-response text-zinc-800 dark:text-zinc-200"
    />
  );
}
