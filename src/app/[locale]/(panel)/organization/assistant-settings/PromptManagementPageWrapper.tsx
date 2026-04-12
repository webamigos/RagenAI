'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';

import {
  ChatModelSelect,
  EditablePrompt,
  VoiceModeSettings,
} from '@/app/components/MyProfile/ChatInstanceSettings';
import { Fallback } from '@/app/components/Fallback';

export default function PromptManagementPage() {
  const t = useTranslations('assistant-settings');

  return (
    <div className="max-w-2xl space-y-8">
      <Suspense fallback={<Fallback />}>
        <section>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
            {t('model-selection')}
          </h2>
          <div className="mt-4">
            <ChatModelSelect />
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
