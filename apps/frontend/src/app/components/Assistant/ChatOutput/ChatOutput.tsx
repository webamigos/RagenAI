import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import markdownit from 'markdown-it';

import { MessageDto } from '../../../contracts/Message';

import './chat-response.css';
import { SpinnerSVG } from '@salesyy/common-ui';
import { Role } from '@prisma/client';
import { ChatResponse } from './ChatResponse';

type Props = {
  messages: MessageDto[];
  isLoading: boolean;
  isInitialLoad: boolean;
  loadingMessage: string;
};

const md = markdownit();

export const ChatOutput = ({
  messages,
  isLoading,
  isInitialLoad,
  loadingMessage = '',
}: Props) => {
  const t = useTranslations('chat');

  return (
    <div className="px-4 sm:px-4 lg:px-22 pt-8">
      <div>
        {messages.map((message, messageIndex) => (
          <div
            key={`message-${message.public_id}-${messageIndex}`}
            className="mb-6 border-solid 	border-2  border-gray-300 rounded-md p-2"
          >
            <div className="text-sm">
              <strong>{t(message.role)}</strong>{' '}
              <span className="font-light">
                {format(new Date(message.created_at), 'dd.MM.yyyy HH:mm:ss')}
              </span>
            </div>
            {/* <ChatResponse
              key={message.public_id}
              message={message}
              isAssistantMessage={
                messageIndex === messages.length - 1 &&
                message.role === Role.ASSISTANT
              }
              isInitialLoad={isInitialLoad}
            /> */}
            <div className="chat-response">
              <div
                dangerouslySetInnerHTML={{
                  __html: md.render(message.content),
                }}
              />
            </div>
          </div>
        ))}
        {isLoading && (
          <p className="flex items-center mb-4">
            <SpinnerSVG />
            {''} {/* {t('loading')} */}
            <span className="ml-2">{loadingMessage}</span>
          </p>
        )}
      </div>
    </div>
  );
};
