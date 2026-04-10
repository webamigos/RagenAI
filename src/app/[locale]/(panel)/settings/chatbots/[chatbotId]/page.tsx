import { notFound } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { getChatbot } from '../actions';
import { ChatbotForm } from '../components/ChatbotForm';
import { ChatbotTabs } from '../components/ChatbotTabs';

export default async function ChatbotEditPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>;
}) {
  const { chatbotId } = await params;
  const chatbot = await getChatbot(chatbotId);

  if (!chatbot) {
    notFound();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Link
            href="/settings/chatbots"
            className="flex size-7 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeftIcon className="size-4" />
          </Link>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
            {chatbot.name}
          </h2>
        </div>
        <ChatbotTabs chatbotId={chatbotId} activeTab="settings" />
      </div>
      <ChatbotForm chatbot={chatbot} />
    </div>
  );
}
