import { useUser } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import markdownit from 'markdown-it';

import type { StreamedMessageDto } from '@/app/contracts/Message';

export const useChatViewLogic = (
  streamedMessage: StreamedMessageDto | null
) => {
  const [renderedStreamedMessage, setRenderedStreamedMessage] = useState('');
  const [streamedMessageRunId, setStreamedMessageRunId] = useState<string>();

  const { user } = useUser();
  const userAvatar = user?.imageUrl;
  const t = useTranslations('chat');
  const md = markdownit();

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
