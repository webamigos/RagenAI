import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import markdownit from 'markdown-it';

import type { StreamedMessageDto } from '@/app/contracts/Message';

export const useChatViewLogic = (
  streamedMessage: StreamedMessageDto | null
) => {
  const [renderedStreamedMessage, setRenderedStreamedMessage] = useState('');
  const [streamedMessageRunId, setStreamedMessageRunId] = useState<string>();
  const [showMessageDetails, setShowMessageDetails] = useState(false);

  const t = useTranslations('chat');
  const md = markdownit();

  const handleMessageDetails = () =>
    setShowMessageDetails((prevState) => !prevState);

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
    showMessageDetails,
    streamedMessageRunId,
    handleMessageDetails,
    renderedStreamedMessage,
  };
};
