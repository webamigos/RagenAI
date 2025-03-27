'use client';

import { useTranslations } from 'next-intl';
import { useEffect, memo } from 'react';

import { useNewThread } from '../hooks/useNewThread';
import { NewChatInterface } from '@/app/components/NewChatInterface';
import { makeVisitorCookieRequest } from '@/app/lib/services/cookies.browser';

const PublicStart = memo(
  ({
    organizationId,
    projectId,
    accessToken,
    widgetMode = false,
  }: {
    organizationId: string;
    projectId: number;
    accessToken: string;
    widgetMode?: boolean;
  }) => {
    const t = useTranslations('Chatbot');
    const { checkExistingThread, isLoading } = useNewThread({
      accessToken,
      projectId,
      widgetMode,
    });

    useEffect(() => {
      // set visitor cookie
      const setCookie = async () => {
        await makeVisitorCookieRequest();
      };

      setCookie();
    }, []);

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
              projectId={projectId}
              isPublicAccess={true}
              widgetMode={widgetMode}
              accessToken={accessToken}
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
