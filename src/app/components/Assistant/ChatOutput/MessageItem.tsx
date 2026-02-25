import { format } from 'date-fns';

import { Text } from '@ragenai/common-ui/Text';
import { ArrowIcon } from '@ragenai/common-ui/icons';
import { MessageDto } from '@/app/contracts/Message';

import { CopyToClipboardButton } from './CopyToClipboardButton';
import { RateAnswer } from './RateAnswer';

type MessageItemProps = {
  message: MessageDto;
  md: any;
  t: (role: string) => string;
  showMessageDetails: boolean;
  handleMessageDetails: () => void;
  streamedMessageRunId?: string | null;
};

export const MessageItem = ({
  message,
  md,
  t,
  showMessageDetails,
  handleMessageDetails,
  streamedMessageRunId,
}: MessageItemProps) => {
  return (
    <div
      className={`group mb-6 rounded-2xl p-5 text-gray-600 bg-white ${
        message.role === 'USER'
          ? 'text-right self-end max-w-3/4 w-auto'
          : 'text-left self-start max-w-3/4 w-auto'
      }`}
    >
      <Text fontSize="sm" fontWeight="semibold">
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
          {showMessageDetails ? (
            <span className="font-light transition-transform duration-300 ease-in-out transform translate-x-0 opacity-100">
              {format(new Date(message.created_at), 'dd.MM.yyyy HH:mm:ss')}
            </span>
          ) : (
            <ArrowIcon
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer"
              onClick={handleMessageDetails}
            />
          )}
        </div>
        {message.role === 'ASSISTANT' && (
          <div className="absolute flex gap-1 -top-8 right-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <RateAnswer
              initialRated={message.rate}
              publicId={message.public_id}
            />
            <CopyToClipboardButton message={message} />
          </div>
        )}
      </div>
    </div>
  );
};
