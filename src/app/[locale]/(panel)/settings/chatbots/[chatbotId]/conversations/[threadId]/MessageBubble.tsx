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
            ? 'bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
            : 'bg-gray-200 text-gray-600 dark:bg-muted dark:text-gray-400'
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
            ? 'rounded-br-md bg-stone-100 dark:bg-stone-800/50'
            : 'rounded-bl-md bg-gray-100 dark:bg-muted/50'
        }`}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {message.content}
        </p>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          {new Date(message.createdAt).toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}
