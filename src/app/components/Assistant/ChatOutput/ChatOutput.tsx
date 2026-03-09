'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CopyToClipboardButton } from './CopyToClipboardButton';
import { RateAnswer } from './RateAnswer';
import { ReadAnswer } from './ReadAnswer/ReadAnswer';
import { DurationTime } from './VoiceMode/components/DurationTime';
import { useChatViewLogic } from './useChatViewLogic';
import { DocumentTextIcon } from '@heroicons/react/20/solid';
import { getFileLabel } from '@ragenai/common-ui/utils/file-helpers';
import type {
  MessageDto,
  StreamedMessageDto,
} from '@/features/messages/contracts/message.types';
import './chat-response.css';

/**
 * Strips [REDACTED] placeholders from reasoning content.
 * Claude's API inserts these when tool calls occur between reasoning blocks.
 */
function cleanReasoningContent(content: string): string {
  return content.replace(/\[REDACTED\]/g, '').trim();
}

const ReasoningBlock = ({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const t = useTranslations('assistant.chat');
  const { renderAndSanitize } = useChatViewLogic(null);

  const cleanedContent = cleanReasoningContent(content);

  if (!cleanedContent && !isStreaming) {
    return null;
  }

  return (
    <div className="mb-3 rounded-lg border border-border/50 bg-muted/30 dark:bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg
          className={`size-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M4.5 2l5 4-5 4V2z" />
        </svg>
        <span>
          {t('thinking')}
          {isStreaming ? '...' : ''}
        </span>
      </button>
      {isOpen && cleanedContent && (
        <div
          className="chat-response px-3 pb-2 text-xs text-muted-foreground/80 leading-relaxed max-h-60 overflow-y-auto"
          dangerouslySetInnerHTML={{
            __html: renderAndSanitize(cleanedContent),
          }}
        />
      )}
    </div>
  );
};

type Props = {
  messages: MessageDto[];
  isLoading: boolean;
  loadingMessage: string;
  streamedMessage: StreamedMessageDto | null;
  isPublicAccess?: boolean;
  onMessagePlayed?: (messageId: string) => void;
  voiceId?: string;
};

const MessageContent = ({
  content,
  role,
  message,
  voiceId,
  isPublicAccess,
}: {
  content: string;
  role: string;
  message?: MessageDto;
  voiceId?: string;
  isPublicAccess: boolean;
}) => {
  const { renderAndSanitize } = useChatViewLogic(null);
  const renderedHtml = renderAndSanitize(content);

  return (
    <div
      className={`chat-response relative ${
        role === 'USER' ? 'user-message' : 'assistant-message'
      }`}
    >
      <div
        dangerouslySetInnerHTML={{
          __html: renderedHtml,
        }}
      />
      {role === 'ASSISTANT' && message && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <RateAnswer
            initialRated={message.rate}
            publicId={message.public_id}
          />
          <CopyToClipboardButton message={message} htmlContent={renderedHtml} />
          {!isPublicAccess && (
            <ReadAnswer content={content} voiceId={voiceId!} />
          )}
        </div>
      )}
      {role === 'USER' &&
        message?.message_type === 'VOICE' &&
        message.voice_duration_seconds && (
          <DurationTime messageDurationTime={message.voice_duration_seconds} />
        )}
    </div>
  );
};

export const ChatOutput = ({
  messages,
  isLoading,
  loadingMessage = '',
  streamedMessage,
  isPublicAccess = false,
  voiceId,
}: Props) => {
  const { renderedStreamedMessage } = useChatViewLogic(streamedMessage);

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-4">
      <div className="flex flex-col gap-2">
        {messages.map((message, messageIndex) => (
          <div key={`message-${message.public_id}-${messageIndex}`}>
            {message.role === 'USER' &&
              message.attachments &&
              message.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2 justify-end">
                  {message.attachments.map((att, i) => {
                    const cardContent = (
                      <>
                        <span
                          className="text-sm leading-snug line-clamp-3"
                          title={att.name}
                        >
                          {att.name}
                        </span>
                        <span className="inline-flex items-center gap-1 self-start rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                          <DocumentTextIcon className="size-3 text-blue-500" />
                          {getFileLabel(att.name)}
                        </span>
                      </>
                    );

                    const baseClass =
                      'flex flex-col gap-2 w-40 rounded-xl border border-border bg-background p-3 text-foreground';

                    if (att.sourceUrl) {
                      return (
                        <a
                          key={`${att.name}-${i}`}
                          href={att.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${baseClass} hover:bg-muted/50 transition-colors no-underline`}
                        >
                          {cardContent}
                        </a>
                      );
                    }

                    return (
                      <div key={`${att.name}-${i}`} className={baseClass}>
                        {cardContent}
                      </div>
                    );
                  })}
                </div>
              )}
            {message.content.trim() && (
              <div
                className={`group relative rounded-2xl px-4 py-3 text-[0.9375rem] leading-relaxed ${
                  message.role === 'USER'
                    ? 'ml-auto max-w-[80%] bg-foreground text-background rounded-br-md'
                    : 'mr-auto max-w-[85%] bg-muted dark:bg-muted/50 text-foreground rounded-bl-md'
                }`}
              >
                <MessageContent
                  content={message.content}
                  role={message.role}
                  message={message}
                  isPublicAccess={isPublicAccess}
                  voiceId={!isPublicAccess ? voiceId : undefined}
                />
              </div>
            )}
          </div>
        ))}
        {streamedMessage &&
          (streamedMessage.content ||
            (streamedMessage.reasoningContent &&
              cleanReasoningContent(streamedMessage.reasoningContent))) && (
            <div className="group relative mr-auto max-w-[85%] rounded-2xl rounded-bl-md bg-muted dark:bg-muted/50 px-4 py-3 text-foreground text-[0.9375rem] leading-relaxed">
              {streamedMessage.reasoningContent && (
                <ReasoningBlock
                  content={streamedMessage.reasoningContent}
                  isStreaming={streamedMessage.isReasoning}
                />
              )}
              <div className="chat-response">
                <div
                  dangerouslySetInnerHTML={{
                    __html: renderedStreamedMessage,
                  }}
                />
              </div>
            </div>
          )}
        {isLoading &&
          streamedMessage &&
          !streamedMessage.content &&
          !(
            streamedMessage.reasoningContent &&
            cleanReasoningContent(streamedMessage.reasoningContent)
          ) && (
            <div className="mr-auto flex items-center rounded-2xl rounded-bl-md bg-muted/60 dark:bg-muted/30 px-4 py-3">
              <div className="flex gap-1">
                <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
        {isLoading && !streamedMessage && loadingMessage && (
          <div className="mr-auto flex items-center rounded-2xl rounded-bl-md bg-muted/60 dark:bg-muted/30 px-4 py-3">
            <div className="flex gap-1">
              <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
              <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
              <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
