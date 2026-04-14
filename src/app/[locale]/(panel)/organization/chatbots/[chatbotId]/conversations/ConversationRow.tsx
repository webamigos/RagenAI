'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { formatRelativeTime } from '@/app/lib/utils/format-relative-time';
import type { getChatbotThreadsQuery } from '@/features/chatbots/services/queries/get-chatbot-threads-query';

type Thread = Awaited<
  ReturnType<typeof getChatbotThreadsQuery>
>['threads'][number];

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export function ConversationRow({
  thread,
  chatbotId,
}: {
  thread: Thread;
  chatbotId: string;
}) {
  const t = useTranslations('settings-page.chatbots');
  const locale = useLocale();

  const shortSession = (thread.visitorId ?? thread.id).slice(0, 8);
  const firstUserMessage = thread.messages.find((m) => m.role === 'USER');
  const preview = firstUserMessage?.content
    ? truncate(firstUserMessage.content, 80)
    : null;

  return (
    <tr className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
          {shortSession}
        </span>
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        {preview ? (
          <span className="text-sm text-zinc-600 dark:text-zinc-300 line-clamp-1">
            {preview}
          </span>
        ) : (
          <span className="text-sm text-zinc-400 dark:text-zinc-500 italic">
            —
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right hidden md:table-cell">
        <span className="tabular-nums text-sm text-zinc-500 dark:text-zinc-400">
          {thread._count.messages > 0 ? thread._count.messages : '—'}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span
          className="text-xs text-zinc-400 dark:text-zinc-500"
          title={new Date(thread.createdAt).toLocaleString(locale)}
        >
          {formatRelativeTime(thread.createdAt, locale)}
        </span>
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/organization/chatbots/${chatbotId}/conversations/${thread.id}`}
          className="flex items-center justify-center size-7 rounded text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
          title={t('conversations.view')}
        >
          <ChevronRightIcon className="size-4" />
        </Link>
      </td>
    </tr>
  );
}
