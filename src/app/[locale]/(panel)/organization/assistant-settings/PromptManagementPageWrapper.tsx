'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';

import {
  ChatModelSelect,
  EditablePrompt,
} from '@/app/components/MyProfile/ChatInstanceSettings';
import { Fallback } from '@/app/components/Fallback';

export default function PromptManagementPage() {
  const t = useTranslations('assistant-settings');

  return (
    <div className="space-y-8">
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
    </div>
  );
}
