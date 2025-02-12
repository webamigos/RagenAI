'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';

import {
  ChatModelSelect,
  EditablePrompt,
  SetChatTemperature,
  SetMaxDocumentsToRetrieve,
} from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetApiKeyWrapper } from '@/app/components/MyProfile/ChatInstanceSettings/SetApiKeyWrapper';
import { Fallback } from '@/app/components/Fallback';
import { useSettings } from '@/app/hooks/useSettings';
import { Card } from '@ragenai/common-ui/Card';

export default function PromptManagementPage() {
  const { hasApiKey } = useSettings();
  const t = useTranslations('assistant-settings');

  return (
    <div className="container flex flex-col">
      <Suspense fallback={<Fallback />}>
        {hasApiKey ? (
          <Suspense fallback={<Fallback />}>
            <SetApiKeyWrapper />
            <Card
              title={t('prompt-assistant-settings')}
              size="full"
              collapsible
              defaultCollapsed
            >
              <div className="flex md:justify-between mb-5 flex-col lg:flex-row gap-5">
                <ChatModelSelect />
                <SetChatTemperature />
                <SetMaxDocumentsToRetrieve />
              </div>
              <EditablePrompt />
            </Card>
          </Suspense>
        ) : (
          <SetApiKeyWrapper />
        )}
      </Suspense>
    </div>
  );
}
