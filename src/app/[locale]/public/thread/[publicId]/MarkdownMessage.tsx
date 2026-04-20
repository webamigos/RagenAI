'use client';

import { useMemo } from 'react';
import DOMPurify from 'dompurify';
// @ts-ignore -- UMD bundle has no type declarations
import MarkdownIt from 'markdown-it/dist/markdown-it.js';
import '@/app/components/Assistant/ChatOutput/chat-response.css';

type Props = {
  content: string;
};

export function MarkdownMessage({ content }: Props) {
  const md = useMemo(() => new MarkdownIt({ linkify: true, breaks: true }), []);

  const html = DOMPurify.sanitize(md.render(content), {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
  });

  return (
    <div
      className="chat-response text-zinc-800 dark:text-zinc-200"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
