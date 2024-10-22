import { format } from 'date-fns';
import { SpinnerSVG, Text, ArrowIcon } from '@salesyy/common-ui';

import { CopyToClipboardButton } from './CopyToClipboardButton';
import { useChatViewLogic } from './useChatViewLogic';
import type {
  MessageDto,
  StreamedMessageDto,
} from '../../../contracts/Message';

import './chat-response.css';
import { RateAnswer } from './RateAnswer';

type Props = {
  messages: MessageDto[];
  isLoading: boolean;
  loadingMessage: string;
  streamedMessage: StreamedMessageDto | null;
};

export const ChatOutput = ({
  messages,
  isLoading,
  loadingMessage = '',
  streamedMessage,
}: Props) => {
  const {
    t,
    md,
    streamedMessageRunId,
    renderedStreamedMessage,
    showMessageDetails,
    handleMessageDetails,
  } = useChatViewLogic(streamedMessage);

  return (
    <div className="px-4 sm:px-4 lg:px-22">
      <div className="flex flex-col">
        {messages.map((message, messageIndex) => (
          <div
            key={`message-${message.public_id}-${messageIndex}`}
            className={`group mb-6 rounded-2xl p-5 text-gray-600 bg-white ${
              message.role === 'USER'
                ? 'text-right self-end max-w-3/4 w-auto'
                : 'text-left self-start max-w-3/4 w-auto'
            }`}
          >
            <Text fontSize="sm" fontWeight="medium">
              {t(message.role)}
            </Text>
            <div
              className={`chat-response relative text-sm ${
                message.role === 'USER' ? 'user-message' : 'assistant-message'
              }`}
            >
              <div
                dangerouslySetInnerHTML={{
                  __html: md.render(message.content),
                }}
              />
              <div className="flex items-center justify-end">
                <span className="font-light text-xs">
                  {format(new Date(message.created_at), 'dd.MM.yyyy HH:mm:ss')}
                </span>
              </div>
              {message.role === 'ASSISTANT' && (
                <div className="absolute flex gap-1 -top-8 right-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <RateAnswer
                    initialRated={message.rate}
                    publicId={message.public_id}
                    runId={streamedMessageRunId || message.run_id}
                  />
                  <CopyToClipboardButton message={message} />
                </div>
              )}
            </div>
          </div>
        ))}

        {streamedMessage && (
          <div className="group mb-6 border-solid border-2 border-gray-300 rounded-md p-2 self-start max-w-3/4 w-auto">
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
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <SpinnerSVG />
            <span className="ml-2">{loadingMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
