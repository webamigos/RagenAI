import { notFound } from 'next/navigation';
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
      <section>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {chatbot.name}
        </h2>
        <ChatbotTabs chatbotId={chatbotId} activeTab="settings" />
      </section>
      <ChatbotForm chatbot={chatbot} />
    </div>
  );
}
