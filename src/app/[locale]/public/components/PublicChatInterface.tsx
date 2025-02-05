'use client';

import { useTranslations } from 'next-intl';
import { memo, useRef } from 'react';
import {
  PromptForm,
  PromptFormRef,
} from '@/app/components/Assistant/PromptForm/PromptForm';
import { usePublicAssistantLogic } from './Assistant/usePublicAssistantLogic';

type PublicChatInterfaceProps = {
  organizationId: string;
  widgetMode?: boolean;
};

export const PublicChatInterface = memo(
  ({ organizationId, widgetMode = false }: PublicChatInterfaceProps) => {
    const t = useTranslations('Chatbot');
    const promptFormRef = useRef<PromptFormRef>(null);

    const { handleInitialSubmit, isNewThreadLoading } = usePublicAssistantLogic(
      null,
      organizationId,
      widgetMode
    );

    return (
      <div className="h-screen flex flex-col items-center justify-center px-4">
        <div className="max-w-2xl w-full space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4 text-gray-900 dark:text-white">
              {t('welcome-message')}
            </h1>
          </div>
          <div className="w-full">
            <PromptForm
              ref={promptFormRef}
              isUserLogged={false}
              isLoading={isNewThreadLoading}
              onSubmit={handleInitialSubmit}
              isPublicAccess={true}
            />
          </div>
        </div>
      </div>
    );
  }
);

PublicChatInterface.displayName = 'PublicChatInterface';
