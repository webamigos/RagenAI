import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import markdownit from 'markdown-it';

import { submitFeedback } from '@/app/lib/services/api';

type Props = {
  content: string;
  created_at: string;
};

export const useChatViewLogic = (streamedMessage: Props | null) => {
  const [renderedStreamedMessage, setRenderedStreamedMessage] = useState('');

  const t = useTranslations('chat');
  const md = markdownit();

  const handleRateMessage = async (
    messageId: string,
    feedback: 'up' | 'down',
    runId: string
  ) => {
    try {
      await submitFeedback(messageId, feedback, runId);
    } catch (error) {
      // console.log('Błąd podczas wysyłania oceny:', error);
    }
  };

  useEffect(() => {
    if (streamedMessage) {
      const rendered = md.render(streamedMessage.content);
      setRenderedStreamedMessage(rendered);
    }
  }, [streamedMessage]);

  return { t, md, handleRateMessage, renderedStreamedMessage };
};
