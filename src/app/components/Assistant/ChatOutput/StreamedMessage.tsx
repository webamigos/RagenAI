import { StreamedMessageDto } from '@/app/contracts/Message';
import { Text } from '@salesyy/common-ui/Text';

type StreamedMessageProps = {
  streamedMessage: StreamedMessageDto;
  t: (role: string) => string;
  renderedStreamedMessage: string;
};

export const StreamedMessage = ({
  streamedMessage,
  t,
  renderedStreamedMessage,
}: StreamedMessageProps) => {
  return (
    <div className="group mb-6 border-solid border-2 border-gray-300 rounded-md p-2 self-start max-w-3/4 w-auto">
      <div className="chat-response">
        <div className="mb-6 text-sm">
          <Text fontWeight="semibold">{t('ASSISTANT')}</Text>
          <span>{new Date(streamedMessage.created_at).toLocaleString()}</span>
        </div>
        <div
          dangerouslySetInnerHTML={{
            __html: renderedStreamedMessage,
          }}
        />
      </div>
    </div>
  );
};
