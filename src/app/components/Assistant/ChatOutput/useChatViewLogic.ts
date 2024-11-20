import { useUser } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

import type { StreamedMessageDto } from '@/app/contracts/Message';

export const useChatViewLogic = (
  streamedMessage: StreamedMessageDto | null
) => {
  const [renderedStreamedMessage, setRenderedStreamedMessage] = useState('');
  const [streamedMessageRunId, setStreamedMessageRunId] = useState<string>();

  const { user } = useUser();
  const userAvatar = user?.imageUrl;
  const t = useTranslations('chat');

  const md = new MarkdownIt({
    highlight: (code, lang) => {
      let highlightedCode;

      if (lang && hljs.getLanguage(lang)) {
        highlightedCode = hljs.highlight(code, { language: lang }).value;
      } else {
        highlightedCode = hljs.highlightAuto(code).value;
      }
      return `
      <div class="code-wrapper">
        <pre class="hljs"><code>${highlightedCode}</code></pre>
      </div>
    `;
    },
  });

  useEffect(() => {
    if (streamedMessage) {
      const rendered = md.render(streamedMessage.content);
      const runId = streamedMessage.runId;
      setRenderedStreamedMessage(rendered);
      setStreamedMessageRunId(runId);
    }
  }, [streamedMessage]);

  return {
    t,
    md,
    userAvatar,
    streamedMessageRunId,
    renderedStreamedMessage,
  };
};
