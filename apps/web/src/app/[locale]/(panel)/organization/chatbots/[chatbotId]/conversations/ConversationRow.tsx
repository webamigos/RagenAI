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
    <tr className="group hover:bg-muted dark:hover:bg-muted/40 transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {shortSession}
        </span>
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        {preview ? (
          <span className="text-sm text-muted-foreground line-clamp-1">
            {preview}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground italic">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right hidden md:table-cell">
        <span className="tabular-nums text-sm text-muted-foreground">
          {thread._count.messages > 0 ? thread._count.messages : '—'}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span
          className="text-xs text-muted-foreground"
          title={new Date(thread.createdAt).toLocaleString(locale)}
        >
          {formatRelativeTime(thread.createdAt, locale)}
        </span>
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/organization/chatbots/${chatbotId}/conversations/${thread.id}`}
          className="flex items-center justify-center size-7 rounded text-muted-foreground hover:text-muted-foreground/90 hover:bg-muted dark:hover:bg-paper-700 transition-colors opacity-0 group-hover:opacity-100"
          title={t('conversations.view')}
        >
          <ChevronRightIcon className="size-4" />
        </Link>
      </td>
    </tr>
  );
}
