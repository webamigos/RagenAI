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
    <div className="max-w-2xl space-y-8">
      <Suspense fallback={<Fallback />}>
        {hasApiKey ? (
          <Suspense fallback={<Fallback />}>
            {showModelApiKey && (
              <section>
                <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
                  API Key
                </h2>
                <div className="mt-4">
                  <SetApiKeyWrapper />
                </div>
              </section>
            )}

            <section>
              <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
                {t('prompt-assistant-settings')}
              </h2>
              <div className="mt-4 space-y-6">
                {showModelSelect && <ChatModelSelect />}
                <div className="grid gap-6 sm:grid-cols-2">
                  <SetChatTemperature />
                  <SetMaxDocumentsToRetrieve />
                </div>
              </div>
            </section>

            <hr className="border-zinc-200 dark:border-zinc-800" />

            <section>
              <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
                {t('editable-prompt.title')}
              </h2>
              <div className="mt-4">
                <EditablePrompt />
              </div>
            </section>
          </Suspense>
        ) : (
          <section>
            <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
              API Key
            </h2>
            <div className="mt-4">
              <SetApiKeyWrapper />
            </div>
          </section>
        )}
      </Suspense>

      <section>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {t('voice-mode-settings.title')}
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t('voice-mode-settings.voice-select')}
        </p>
        <div className="mt-4">
          <VoiceModeSettings />
        </div>
      </section>
    </div>
  );
}
