import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { getChatbotThreadMessages } from '../../../actions';
import { MessageBubble } from './MessageBubble';

type Props = {
  params: Promise<{ chatbotId: string; threadId: string; locale: string }>;
};

export default async function ChatbotConversationThreadPage({ params }: Props) {
  const { chatbotId, threadId, locale } = await params;
  const t = await getTranslations('settings-page.chatbots.conversations');

  const data = await getChatbotThreadMessages(threadId);

  if (!data) {
    notFound();
  }

  const { thread, messages } = data;
  const shortSession = (thread.visitorId ?? thread.id).slice(0, 8);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/settings/chatbots/${chatbotId}/conversations`}
          className="flex size-7 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
            {t('session-id')}{' '}
            <span className="font-mono text-sm font-normal text-zinc-500 dark:text-zinc-400">
              {shortSession}
            </span>
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {new Date(thread.createdAt).toLocaleString(locale)}
          </p>
        </div>
      </div>

      {messages.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t('empty-thread')}
        </p>
      ) : (
        <div className="space-y-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      )}
    </div>
  );
}
