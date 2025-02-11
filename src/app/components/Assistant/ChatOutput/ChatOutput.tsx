import { SpinnerSVG, Text } from '@ragenai/common-ui';

import { CopyToClipboardButton } from './CopyToClipboardButton';
import { RateAnswer } from './RateAnswer';
import { ReadAnswer } from './ReadAnswer';
import { DurationTime } from './DurationTime';
import { useChatViewLogic } from './useChatViewLogic';
import type {
  MessageDto,
  StreamedMessageDto,
  ChatResponseType,
} from '../../../contracts/Message';

import './chat-response.css';

type Props = {
  messages: MessageDto[];
  isLoading: boolean;
  widgetMode?: boolean;
  responseType?: ChatResponseType;
  loadingMessage: string;
  streamedMessage: StreamedMessageDto | null;
  isPublicAccess?: boolean;
  onMessagePlayed?: (messageId: string) => void;
};

const MessageContent = ({
  content,
  role,
  message,
  streamedMessageRunId,
  responseType,
}: {
  content: string;
  role: string;
  message?: MessageDto;
  streamedMessageRunId?: string;
  responseType?: ChatResponseType;
}) => {
  const { md, t } = useChatViewLogic(null);

  return (
    <>
      {role === 'ASSISTANT' && (
        <Text fontSize="sm" fontWeight="bold">
          {t(role)}
        </Text>
      )}
      <div
        className={`chat-response relative ${
          role === 'USER' ? 'user-message' : 'assistant-message'
        }`}
      >
        <div
          dangerouslySetInnerHTML={{
            __html: md.render(content),
          }}
        />
        {role === 'ASSISTANT' && message && (
          <div className="absolute flex gap-1 -top-8 right-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <RateAnswer
              initialRated={message.rate}
              publicId={message.public_id}
              runId={streamedMessageRunId || message.run_id}
            />
            <CopyToClipboardButton message={message} />
            <ReadAnswer content={content} />
          </div>
        )}
        {role === 'USER' &&
          message?.message_type === 'VOICE' &&
          message.voice_duration_seconds && (
            <DurationTime
              messageDurationTime={message.voice_duration_seconds}
            />
          )}
      </div>
    </>
  );
};

export const ChatOutput = ({
  messages,
  isLoading,
  widgetMode = false,
  loadingMessage = '',
  streamedMessage,
  isPublicAccess = false,
  responseType,
}: Props) => {
  const { t, streamedMessageRunId, renderedStreamedMessage } =
    useChatViewLogic(streamedMessage);

  return (
    <div className="px-5 mt-5 mr-3 lg:px-22">
      <div className="flex flex-col">
        {messages.map((message, messageIndex) => (
          <div
            key={`message-${message.public_id}-${messageIndex}`}
            className={`group max-w-10/12 mb-6 px-4 rounded-2xl text-gray-600 dark:text-gray-200 shadow-lg shadow-slate-200 dark:shadow-none ${
              message.role === 'USER'
                ? 'text-right self-end border border-slate-100 dark:border-gray-800 bg-white dark:bg-secondary-dark'
                : 'pt-4 text-left self-start text-base shadow-none bg-primary-light dark:bg-primary-dark'
            } ${messageIndex === 0 && !widgetMode ? 'lg:first:mt-14' : ''}`}
          >
            <MessageContent
              content={message.content}
              role={message.role}
              message={message}
              streamedMessageRunId={streamedMessageRunId}
              responseType={responseType}
            />
          </div>
        ))}
        {streamedMessage && (
          <div className="group mb-6 rounded-2xl -mt-3 px-4 text-gray-600 max-w-10/12 shadow-lg shadow-slate-200 text-left self-start text-base dark:shadow-none dark:text-gray-200">
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
          <div
            className={`absolute ${
              isPublicAccess
                ? 'bottom-[90px] md:left-[71px]'
                : 'bottom-[120px] md:left-14'
            } flex items-center justify-center pointer-events-none dark:text-gray-300 text-gray-600 text-md`}
          >
            <SpinnerSVG />
            <span className="ml-2">{loadingMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
