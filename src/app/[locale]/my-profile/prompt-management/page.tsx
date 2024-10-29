import {
  ChatModelSelect,
  EditablePrompt,
  SetChatTemperature,
} from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetApiKeyWrapper } from '@/app/components/MyProfile/ChatInstanceSettings/SetApiKeyWrapper';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('prompt-management.title'),
  };
}

export default function PromptManagementPage() {
  return (
    <div className="container flex flex-col">
      <SetApiKeyWrapper />

      <div className="flex md:justify-between mb-5 flex-col md:flex-row">
        <SetChatTemperature />
        <ChatModelSelect />
      </div>

      <EditablePrompt />
    </div>
  );
}
