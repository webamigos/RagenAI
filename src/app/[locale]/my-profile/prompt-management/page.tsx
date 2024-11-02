import { getTranslations } from 'next-intl/server';
import {
  ChatModelSelect,
  EditablePrompt,
  SetChatTemperature,
  SetMaxDocumentsToRetrieve,
} from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetApiKeyWrapper } from '@/app/components/MyProfile/ChatInstanceSettings/SetApiKeyWrapper';
import { PropsWihLocale } from '@/app/lib/types/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('prompt-management.title'),
  };
}

export default function PromptManagementPage() {
  return (
    <div className="container flex flex-col">
      <SetApiKeyWrapper />

      <div className="flex md:justify-between mb-5 flex-col lg:flex-row gap-5">
        <ChatModelSelect />
        <SetChatTemperature />
        <SetMaxDocumentsToRetrieve />
      </div>

      <EditablePrompt />
    </div>
  );
}
