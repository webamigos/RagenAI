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
      <ChatbotsList
        chatbots={chatbots}
        title={t('title')}
        description={t('description')}
      />
    </div>
  );
}
