'use client';

import { useTranslations } from 'next-intl';
import { useEffect, memo } from 'react';

import { useNewThread } from '../hooks/useNewThread';
import { NewChatInterface } from '@/app/components/NewChatInterface';

const PublicStart = memo(
  ({
    organizationId,
    widgetMode = false,
  }: {
    organizationId: string;
    widgetMode?: boolean;
  }) => {
    const t = useTranslations('Chatbot');
    const { checkExistingThread, isLoading } = useNewThread({
      organizationId,
      widgetMode,
    });

    useEffect(() => {
      const checkThread = async () => {
        if (widgetMode) {
          await checkExistingThread();
        }
      };

      checkThread();
    }, [widgetMode, checkExistingThread]);

    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="flex w-full flex-col items-center">
          {!widgetMode && (
            <NewChatInterface
              organizationId={organizationId}
              isPublicAccess={true}
              widgetMode={widgetMode}
            />
          )}

          {widgetMode && isLoading && (
            <p className="text-center text-gray-600 dark:text-gray-200">
              {t('opening-chat-thread')}
            </p>
          )}
        </div>
      </div>
    );
  }
);

PublicStart.displayName = 'PublicStart';

export { PublicStart };
