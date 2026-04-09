import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getChatbot } from '../actions';
import { ChatbotForm } from '../components/ChatbotForm';

export default async function ChatbotEditPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>;
}) {
  const { chatbotId } = await params;
  const t = await getTranslations('settings-page.chatbots');
  const chatbot = await getChatbot(chatbotId);

  if (!chatbot) {
    notFound();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {t('edit-title')}
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t('edit-description')}
        </p>
      </section>
      <ChatbotForm chatbot={chatbot} />
    </div>
  );
}
