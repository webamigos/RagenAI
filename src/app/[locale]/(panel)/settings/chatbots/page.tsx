import { getTranslations } from 'next-intl/server';
import { getChatbots } from './actions';
import { ChatbotsList } from './components/ChatbotsList';

export async function generateMetadata() {
  const t = await getTranslations('Metadata');
  return { title: t('settings-chatbots.title') };
}

export default async function ChatbotsSettingsPage() {
  const t = await getTranslations('settings-page.chatbots');
  const chatbots = await getChatbots();

  return (
    <div className="max-w-2xl space-y-4">
      <section>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t('description')}
        </p>
      </section>
      <ChatbotsList chatbots={chatbots} />
    </div>
  );
}
