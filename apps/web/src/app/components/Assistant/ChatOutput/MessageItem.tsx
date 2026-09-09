import { format } from 'date-fns';
import DOMPurify from 'dompurify';

import { Text } from '@ragenai/common-ui/Text';
import { ArrowIcon } from '@ragenai/common-ui/icons';
import { type MessageDto } from '@/features/messages/contracts/message.types';

import { CopyToClipboardButton } from './CopyToClipboardButton';
import { RateAnswer } from './RateAnswer';
import { SourcesBlock } from './SourcesBlock';
import { useAppSelector } from '@/store/hooks';

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
  streamedMessageRunId: _streamedMessageRunId,
}: MessageItemProps) => {
  // Only the live turn has one. A reopened thread finds nothing here because
  // retrieval is not persisted yet (gap 5), and no block is the honest render
  // — an empty one would claim the knowledge base was searched and came back
  // empty.
  const retrieval = useAppSelector(
    (state) => state.assistant.retrievalByMessage[message.id],
  );

  return (
    <div
      className={`group mb-6 rounded-2xl p-5 text-foreground bg-card ${
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
            __html: DOMPurify.sanitize(md.render(message.content), {
              FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
            }),
          }}
        />
        <div className="flex items-center justify-end">
          {showMessageDetails ? (
            <span className="font-light transition-transform duration-300 ease-in-out transform translate-x-0 opacity-100">
              {format(new Date(message.createdAt), 'dd.MM.yyyy HH:mm:ss')}
            </span>
          ) : (
            <ArrowIcon
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer"
              onClick={handleMessageDetails}
            />
          )}
        </div>
        {message.role === 'ASSISTANT' && retrieval ? (
          <SourcesBlock retrieval={retrieval} />
        ) : null}
        {message.role === 'ASSISTANT' && (
          <div className="absolute flex gap-1 -top-8 right-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <RateAnswer initialRated={message.rate} messageId={message.id} />
            <CopyToClipboardButton message={message} />
          </div>
        )}
      </div>
    </div>
  );
};
