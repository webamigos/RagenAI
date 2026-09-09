'use client';

import { useLocale } from 'next-intl';
import { UserIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
type Message = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

export function MessageBubble({ message }: { message: Message }) {
  const locale = useLocale();
  const isUser = message.role === 'USER';

  return (
    <div
      className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <div
        className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'bg-paper-200 text-muted-foreground dark:bg-paper-700'
            : 'bg-paper-200 text-muted-foreground dark:bg-muted'
        }`}
      >
        {isUser ? (
          <UserIcon className="size-3.5" />
        ) : (
          <ChatBubbleLeftRightIcon className="size-3.5" />
        )}
      </div>

      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm text-foreground ${
          isUser
            ? 'rounded-br-md bg-muted dark:bg-muted/50'
            : 'rounded-bl-md bg-muted dark:bg-muted/50'
        }`}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {message.content}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(message.createdAt).toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}
