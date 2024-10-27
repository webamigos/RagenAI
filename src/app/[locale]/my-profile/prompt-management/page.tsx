import { getTranslations } from 'next-intl/server';
import {
  ChatModelSelect,
  EditablePrompt,
  SetChatTemperature,
} from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetApiKeyWrapper } from '@/app/components/MyProfile/ChatInstanceSettings/SetApiKeyWrapper';
import { PropsWihLocale } from '@/app/lib/types/types';
import { Fallback } from '@/app/components/Fallback';
import { Suspense } from 'react';

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
      <Suspense fallback={<Fallback />}>
        <SetApiKeyWrapper />
      </Suspense>

      <div className="flex md:justify-between mb-5 flex-col md:flex-row">
        <Suspense fallback={<Fallback />}>
          <SetChatTemperature />
        </Suspense>
        <Suspense fallback={<Fallback />}>
          <ChatModelSelect />
        </Suspense>
      </div>

      <Suspense fallback={<Fallback />}>
        <EditablePrompt />
      </Suspense>
    </div>
  );
}
