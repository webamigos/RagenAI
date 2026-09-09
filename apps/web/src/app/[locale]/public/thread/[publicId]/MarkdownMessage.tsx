'use client';

import { useMemo } from 'react';
// @ts-ignore -- UMD bundle has no type declarations
import MarkdownIt from 'markdown-it/dist/markdown-it.js';
import { applyLinkifyPolicy } from '@/libs/markdown/linkify-policy';
import DOMPurify from 'dompurify';
import { MarkdownWithMermaid } from '@/app/components/Assistant/ChatOutput/MarkdownWithMermaid';
import '@/app/components/Assistant/ChatOutput/chat-response.css';

type Props = {
  content: string;
};

export function MarkdownMessage({ content }: Props) {
  // Same policy as the panel's renderer: a filename in an answer must not
  // become an external link. This surface matters more, not less — it is what
  // a customer's own visitors see.
  const md = useMemo(
    () => applyLinkifyPolicy(new MarkdownIt({ linkify: true, breaks: true })),
    [],
  );

  const renderAndSanitize = useMemo(
    () => (markdown: string) => {
      const html = md.render(markdown);
      if (typeof window === 'undefined') {
        return '';
      }
      return DOMPurify.sanitize(html, {
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
      });
    },
    [md],
  );

  return (
    <MarkdownWithMermaid
      content={content}
      renderAndSanitize={renderAndSanitize}
      className="chat-response text-foreground"
    />
  );
}
