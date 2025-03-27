'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';

import {
  ChatModelSelect,
  EditablePrompt,
  SetChatTemperature,
  SetMaxDocumentsToRetrieve,
  VoiceModeSettings,
} from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetApiKeyWrapper } from '@/app/components/MyProfile/ChatInstanceSettings/SetApiKeyWrapper';
import { Fallback } from '@/app/components/Fallback';
import { useSettings } from '@/app/hooks/useSettings';
import { Card } from '@ragenai/common-ui/Card';

type Props = {
  showModelApiKey?: boolean;
  showModelSelect?: boolean;
};

export default function PromptManagementPage({
  showModelApiKey,
  showModelSelect,
}: Props) {
  const { hasApiKey } = useSettings();
  const t = useTranslations('assistant-settings');

  return (
    <div className="container flex flex-col gap-3">
      <Suspense fallback={<Fallback />}>
        {hasApiKey ? (
          <Suspense fallback={<Fallback />}>
            {showModelApiKey && <SetApiKeyWrapper />}
            <Card
              title={t('prompt-assistant-settings')}
              size="full"
              collapsible
              defaultCollapsed
            >
              <div className="flex md:justify-between mb-5 flex-col lg:flex-row gap-5">
                {showModelSelect && <ChatModelSelect />}
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
      <VoiceModeSettings />
    </div>
  );
}
