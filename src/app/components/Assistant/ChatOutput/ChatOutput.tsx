import { format } from 'date-fns';
import { SpinnerSVG } from '@salesyy/common-ui';

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
    handleRateMessage,
    streamedMessageRunId,
    renderedStreamedMessage,
  } = useChatViewLogic(streamedMessage);
  return (
    <div className="px-4 sm:px-4 lg:px-22 pt-8">
      <div>
        {messages.map((message, messageIndex) => (
          <div
            key={`message-${message.public_id}-${messageIndex}`}
            className="group mb-6 border-solid border-2 border-gray-300 rounded-md p-2"
          >
            <div className="text-sm">
              <strong>{t(message.role)}</strong>{' '}
              <span className="font-light">
                {format(new Date(message.created_at), 'dd.MM.yyyy HH:mm:ss')}
              </span>
            </div>
            <div className="chat-response relative">
              <div
                dangerouslySetInnerHTML={{
                  __html: md.render(message.content),
                }}
              />
              {message.role === 'ASSISTANT' && (
                <div className="absolute flex gap-1 -top-8 right-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <RateAnswer
                    handleRateMessage={handleRateMessage}
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
          <div className="group mb-6 border-solid border-2 border-gray-300 rounded-md p-2">
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
