'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, memo } from 'react';
import { useRouter } from '@/i18n/routing';

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
    projectId: string;
    accessToken: string;
    widgetMode?: boolean;
  }) => {
    const t = useTranslations('Chatbot');
    const { push } = useRouter();
    const [isRedirecting, setIsRedirecting] = useState(false);
    const { checkExistingThread, getRecentThreadId, isLoading } = useNewThread({
      accessToken,
      projectId,
      organizationId,
      widgetMode,
    });

    useEffect(() => {
      makeVisitorCookieRequest();
    }, []);

    // Auto-redirect to recent thread if one exists in localStorage
    useEffect(() => {
      if (widgetMode) {
        checkExistingThread();
        return;
      }

      const recentThread = getRecentThreadId();
      if (recentThread) {
        setIsRedirecting(true);
        push(`/public/assistants/${accessToken}/threads/${recentThread}`);
      }
    }, [widgetMode, checkExistingThread, getRecentThreadId, accessToken, push]);

    if (isRedirecting) {
      return (
        <div className="h-screen w-full flex items-center justify-center">
          <p className="text-muted-foreground">{t('opening-chat-thread')}</p>
        </div>
      );
    }

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
  },
);

PublicStart.displayName = 'PublicStart';

export { PublicStart };
