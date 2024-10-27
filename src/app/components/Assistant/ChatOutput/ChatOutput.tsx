import { SpinnerSVG, Text } from '@salesyy/common-ui';

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
  const { t, md, streamedMessageRunId, renderedStreamedMessage } =
    useChatViewLogic(streamedMessage);

  return (
    <div className="px-5 mr-3 lg:px-22 lg:mt-0">
      <div className="flex flex-col">
        {messages.map((message, messageIndex) => (
          <div
            key={`message-${message.public_id}-${messageIndex}`}
            className={`group mb-6 rounded-2xl px-4 text-gray-600 max-w-10/12 shadow-lg shadow-slate-200 ${
              message.role === 'USER'
                ? 'text-right self-end border border-slate-100 bg-white'
                : 'text-left self-start text-base shadow-none bg-primary-light'
            }`}
          >
            {message.role === 'ASSISTANT' ? (
              <Text fontSize="sm" fontWeight="bold">
                {t(message.role)}
              </Text>
            ) : null}
            <div
              className={`chat-response relative ${
                message.role === 'USER' ? 'user-message' : 'assistant-message'
              }`}
            >
              <div
                dangerouslySetInnerHTML={{
                  __html: md.render(message.content),
                }}
              />
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
          <div className="group mb-6 rounded-2xl -mt-3 px-4 text-gray-600 max-w-10/12 shadow-lg shadow-slate-200 text-left self-start text-base">
            <div className="chat-response">
              <div>
                <Text fontSize="sm" fontWeight="semibold">
                  {t('ASSISTANT')}
                </Text>
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
          <div className="absolute bottom-[84px] left-28 flex items-center justify-center pointer-events-none">
            <SpinnerSVG />
            <span className="ml-2">{loadingMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
