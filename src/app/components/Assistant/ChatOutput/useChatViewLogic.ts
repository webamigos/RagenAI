import { useUser } from '@/app/hooks/use-auth';
import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
// Use the pre-built UMD bundle — Turbopack has a bug with markdown-it's ESM
// build where named re-exports (isSpace) are lost during bundling.
// @ts-ignore -- UMD bundle has no type declarations
import MarkdownIt from 'markdown-it/dist/markdown-it.js';
import hljs from 'highlight.js';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import DOMPurify from 'dompurify';

import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

import type { StreamedMessageDto } from '@/features/messages/contracts/message.types';
import { logger } from '@/app/lib/utils/logger';

const createMarkdownRenderer = () => {
  const md = new MarkdownIt({
    highlight: (code, lang) => {
      try {
        let highlightedCode;
        if (lang && hljs.getLanguage(lang)) {
          highlightedCode = hljs.highlight(code, { language: lang }).value;
        } else {
          highlightedCode = hljs.highlightAuto(code).value;
        }
        return `<div class="code-wrapper"><pre class="hljs"><code>${highlightedCode}</code></pre></div>`;
      } catch (error) {
        logger.error('Error highlighting code:', error);
        return code;
      }
    },
  });

  md.use(texmath, {
    engine: katex,
    delimiters: 'brackets',
    katexOptions: { throwOnError: false },
  });

  return md;
};

const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: [
      'onerror',
      'onclick',
      'onload',
      'onmouseover',
      'onfocus',
      'onblur',
    ],
    ALLOW_ARIA_ATTR: true,
    ALLOW_DATA_ATTR: false,
  });
};

export const useChatViewLogic = (
  streamedMessage: StreamedMessageDto | null,
) => {
  const [renderedStreamedMessage, setRenderedStreamedMessage] = useState('');
  const [streamedMessageRunId, setStreamedMessageRunId] = useState<string>();

  const { user } = useUser();
  const userAvatar = user?.image;
  const t = useTranslations('chat');

  const md = useMemo(() => createMarkdownRenderer(), []);

  const renderAndSanitize = useMemo(() => {
    return (content: string) => sanitizeHtml(md.render(content));
  }, [md]);

  useEffect(() => {
    if (streamedMessage) {
      const rendered = renderAndSanitize(streamedMessage.content);
      const runId = streamedMessage.runId;
      setRenderedStreamedMessage(rendered);
      setStreamedMessageRunId(runId);
    }
  }, [streamedMessage, md, renderAndSanitize]);

  return {
    t,
    md,
    renderAndSanitize,
    userAvatar,
    streamedMessageRunId,
    renderedStreamedMessage,
  };
};
