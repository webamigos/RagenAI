'use client';

import { useTranslations } from 'next-intl';

import {
  ChatModelSelect,
  PublicChatModelSelect,
  EditablePrompt,
} from '@/app/components/MyProfile/ChatInstanceSettings';

export default function PromptManagementPage() {
  const t = useTranslations('assistant-settings');
  const hideModelSelector = process.env.NEXT_PUBLIC_HIDE_MODEL_SELECTOR === '1';

  return (
    <div className="space-y-8">
      {!hideModelSelector && (
        <>
          <section>
            <h2 className="text-base font-semibold text-foreground dark:text-white">
              {t('model-selection')}
            </h2>
            <div className="mt-4">
              <ChatModelSelect />
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <h2 className="text-base font-semibold text-foreground dark:text-white">
              {t('public-chat-model.section-title')}
            </h2>
            <div className="mt-4">
              <PublicChatModelSelect />
            </div>
          </section>

          <hr className="border-border" />
        </>
      )}

      <section>
        <h2 className="text-base font-semibold text-foreground dark:text-white">
          {t('editable-prompt.title')}
        </h2>
        <div className="mt-4">
          <EditablePrompt />
        </div>
      </section>
    </div>
  );
}
