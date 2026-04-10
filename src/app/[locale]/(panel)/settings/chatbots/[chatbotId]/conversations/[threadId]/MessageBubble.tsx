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
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
            : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
        }`}
      >
        {isUser ? (
          <UserIcon className="size-3.5" />
        ) : (
          <ChatBubbleLeftRightIcon className="size-3.5" />
        )}
      </div>

      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? 'rounded-tr-sm bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
            : 'rounded-tl-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
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
