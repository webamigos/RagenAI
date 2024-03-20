import { format } from 'date-fns';
import { useTranslations } from 'next-intl';

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

export const ChatOutput = ({
  messages,
  isLoading,
  isInitialLoad,
  loadingMessage = '',
}: Props) => {
  const t = useTranslations('chat');

  return (
    <div className="px-4 sm:px-4 lg:px-22 py-8">
      <div>
        {messages.map((message, messageIndex) => (
          <div
            key={message.public_id}
            className="mb-6 border-solid 	border-2  border-gray-300 rounded-md p-2"
          >
            <div className="text-sm">
              <strong>{t(message.role)}</strong>{' '}
              <span className="font-light">
                {format(new Date(message.created_at), 'dd.MM.yyyy HH:mm:ss')}
              </span>
            </div>
            <ChatResponse
              message={message}
              isAssistantMessage={
                messageIndex === messages.length - 1 &&
                message.role === Role.ASSISTANT
              }
              isInitialLoad={isInitialLoad}
            />
          </div>
        ))}
        {isLoading && (
          <p className="flex mb-4 ml-2">
            <SpinnerSVG />
            {''} {/* {t('loading')} */}
            {loadingMessage}
          </p>
        )}
      </div>
    </div>
  );
};
