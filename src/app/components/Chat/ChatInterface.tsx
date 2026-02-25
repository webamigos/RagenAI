'use client';

import { useChat, type UIMessage } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input';

type Props = {
  threadId: string;
  initialMessages?: UIMessage[];
};

function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

export function ChatInterface({ threadId, initialMessages = [] }: Props) {
  const t = useTranslations('Index');

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: `/api/chat/${threadId}`,
      }),
    [threadId],
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
    messages: initialMessages,
  });

  return (
    <div className="flex flex-col h-full">
      <Conversation className="flex-1">
        {messages.length === 0 ? (
          <ConversationEmptyState
            title={t('new-thread-header')}
            description={t('new-thread-description')}
          />
        ) : (
          <ConversationContent className="max-w-3xl mx-auto w-full">
            {messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.role === 'user' ? (
                    <p className="whitespace-pre-wrap">
                      {getTextContent(message)}
                    </p>
                  ) : (
                    <MessageResponse>
                      {getTextContent(message)}
                    </MessageResponse>
                  )}
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
        )}
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border bg-background p-4">
        <div className="max-w-3xl mx-auto">
          {error && (
            <div className="mb-3 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error.message}
            </div>
          )}
          <PromptInput
            onSubmit={({ text }) => {
              sendMessage({ text });
            }}
          >
            <PromptInputTextarea placeholder={t('new-thread-placeholder')} />
            <PromptInputFooter>
              <div />
              <PromptInputSubmit status={status} onStop={stop} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
