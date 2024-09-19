import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import markdownit from 'markdown-it';
import { AxiosError } from 'axios';

import { submitFeedback } from '@/app/lib/services/api';
import { useToast } from '@/app/hooks/useToast';
import type { StreamedMessageDto } from '@/app/contracts/Message';

export const useChatViewLogic = (
  streamedMessage: StreamedMessageDto | null
) => {
  const [renderedStreamedMessage, setRenderedStreamedMessage] = useState('');
  const [streamedMessageRunId, setStreamedMessageRunId] = useState<string>();

  const t = useTranslations('chat');
  const tr = useTranslations('rate-answer');
  const md = markdownit();
  const { infoToast, errorToast } = useToast();

  const handleRateMessage = async (
    messageId: string,
    feedback: 'up' | 'down',
    runId: string
  ) => {
    try {
      const { data }: { data: { message: string } } = await submitFeedback(
        messageId,
        feedback,
        runId
      );
      if (data.message === 'Feedback submitted') {
        infoToast({ message: tr('thank-you') });
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        errorToast({ message: error.message });
      }
    }
  };

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
    handleRateMessage,
    streamedMessageRunId,
    renderedStreamedMessage,
  };
};
