import { format } from 'date-fns';
import markdownit from 'markdown-it';

import { Message } from '../Assistant';

import './chat-response.css';

type Props = {
  messages: Message[];
  loading: boolean;
};

export const ChatOutput = ({ messages, loading }: Props) => {
  const md = markdownit();

  return (
    <div>
      <div className="chat-response">
        {messages.map((message) => (
          <div key={message.public_id} className="mb-4">
            <div>
              <strong>{message.role}</strong>{' '}
              <span className="font-light">
                {format(message.created_at, 'dd.MM.yyyy HH:mm:ss')}
              </span>
            </div>
            <div
              dangerouslySetInnerHTML={{ __html: md.render(message.content) }}
            />
          </div>
        ))}
        {loading && (
          <p className="flex">
            <svg
              className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-900 dark:text-white mr-2"
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
            Loading...
          </p>
        )}
      </div>
    </div>
  );
};
