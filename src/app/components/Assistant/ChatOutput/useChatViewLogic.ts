import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import markdownit from 'markdown-it';
import { toast } from 'react-toastify';

type Props = {
  content: string;
  created_at: string;
};

export const useChatViewLogic = (streamedMessage: Props | null) => {
  const [renderedStreamedMessage, setRenderedStreamedMessage] = useState('');

  const t = useTranslations('chat');

  const md = markdownit();
  useEffect(() => {
    if (streamedMessage) {
      const rendered = md.render(streamedMessage.content);
      setRenderedStreamedMessage(rendered);
    }
  }, [streamedMessage]);

  const successToast = (message: string) => {
    toast.success(message, {
      position: 'top-right',
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
    });
  };

  return { t, md, successToast, renderedStreamedMessage };
};
