import { useUser } from '@/app/hooks/use-auth';
import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import texmath from 'markdown-it-texmath';
import katex from 'katex';

import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

import type { StreamedMessageDto } from '@/app/contracts/Message';
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

export const useChatViewLogic = (
  streamedMessage: StreamedMessageDto | null
) => {
  const [renderedStreamedMessage, setRenderedStreamedMessage] = useState('');
  const [streamedMessageRunId, setStreamedMessageRunId] = useState<string>();

  const { user } = useUser();
  const userAvatar = user?.image;
  const t = useTranslations('chat');

  const md = useMemo(() => createMarkdownRenderer(), []);

  useEffect(() => {
    if (streamedMessage) {
      const rendered = md.render(streamedMessage.content);
      const runId = streamedMessage.runId;
      setRenderedStreamedMessage(rendered);
      setStreamedMessageRunId(runId);
    }
  }, [streamedMessage, md]);

  return {
    t,
    md,
    userAvatar,
    streamedMessageRunId,
    renderedStreamedMessage,
  };
};
