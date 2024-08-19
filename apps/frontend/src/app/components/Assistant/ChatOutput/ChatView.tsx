import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import markdownit from 'markdown-it';

import { SpinnerSVG } from '@salesyy/common-ui';
import './chat-response.css';

import type { MessageDto } from '../../../contracts/Message';

type Props = {
  messages: MessageDto[];
  isLoading: boolean;
  loadingMessage: string;
  streamedMessage: { content: string; created_at: string } | null;
};

const md = markdownit();

export const ChatView = ({
  messages,
  isLoading,
  loadingMessage = '',
  streamedMessage,
}: Props) => {
  const t = useTranslations('chat');
  const [renderedStreamedMessage, setRenderedStreamedMessage] = useState('');

  useEffect(() => {
    if (streamedMessage) {
      const rendered = md.render(streamedMessage.content);
      setRenderedStreamedMessage(rendered);
    }
  }, [streamedMessage]);

  return (
    <div className="px-4 sm:px-4 lg:px-22 pt-8">
      <div>
        {messages.map((message, messageIndex) => (
          <div
            key={`message-${message.public_id}-${messageIndex}`}
            className="mb-6 border-solid border-2 border-gray-300 rounded-md p-2"
          >
            <div className="text-sm">
              <strong>{t(message.role)}</strong>{' '}
              <span className="font-light">
                {format(new Date(message.created_at), 'dd.MM.yyyy HH:mm:ss')}
              </span>
            </div>
            <div className="chat-response">
              <div
                dangerouslySetInnerHTML={{
                  __html: md.render(message.content),
                }}
              />
            </div>
          </div>
        ))}

        {streamedMessage && (
          <div className="mb-6 border-solid border-2 border-gray-300 rounded-md p-2">
            <div className="chat-response">
              <div className="mb-6 text-sm">
                <strong>{t('ASSISTANT')}</strong>{' '}
                <span>
                  {new Date(streamedMessage.created_at).toLocaleString()}
                </span>
              </div>
              <div
                dangerouslySetInnerHTML={{
                  __html: renderedStreamedMessage,
                }}
              />
            </div>
          </div>
        )}

        {isLoading && (
          <p className="flex items-center mb-4">
            <SpinnerSVG />
            <span className="ml-2">{loadingMessage}</span>
          </p>
        )}
      </div>
    </div>
  );
};
