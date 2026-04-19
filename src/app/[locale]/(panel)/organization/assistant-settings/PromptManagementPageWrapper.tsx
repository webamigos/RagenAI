'use client';

import { useTranslations } from 'next-intl';

import {
  ChatModelSelect,
  PublicChatModelSelect,
  EditablePrompt,
} from '@/app/components/MyProfile/ChatInstanceSettings';

export default function PromptManagementPage() {
  const t = useTranslations('assistant-settings');

  return (
    <div className="space-y-8">
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
          {t('public-chat-model.section-title')}
        </h2>
        <div className="mt-4">
          <PublicChatModelSelect />
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
    </div>
  );
}
