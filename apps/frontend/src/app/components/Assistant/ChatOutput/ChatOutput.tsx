import { format } from 'date-fns';
import markdownit from 'markdown-it';
import { useTranslations } from 'next-intl';

import { MessageDto } from '../../../contracts/Message';

import './chat-response.css';

type Props = {
  messages: MessageDto[];
  isLoading: boolean;
  loadingMessage: string;
};

const md = markdownit();

export const ChatOutput = ({
  messages,
  isLoading,
  loadingMessage = '',
}: Props) => {
  const t = useTranslations('chat');

  return (
    <div className="px-16 sm:px-24 lg:px-22 py-8">
      <div>
        {messages.map((message) => (
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
            <div
              className="chat-response"
              dangerouslySetInnerHTML={{ __html: md.render(message.content) }}
            />
          </div>
        ))}
        {isLoading && (
          <p className="flex mb-4 ml-2">
            <svg
              className="animate-spin -ml-1 h-5 w-5  dark:text-white mr-2"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>{' '}
            {/* {t('loading')} */}
            {loadingMessage}
          </p>
        )}
      </div>
    </div>
  );
};
