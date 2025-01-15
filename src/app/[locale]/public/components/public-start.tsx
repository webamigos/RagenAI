'use client';

import { useTranslations } from 'next-intl';
import { RocketLaunchIcon } from '@heroicons/react/24/outline';
import { useEffect, memo } from 'react';

import { Button } from '@ragenai/common-ui';
import { useNewThread } from '../hooks/useNewThread';

const PublicStart = memo(
  ({
    organizationId,
    widgetMode = false,
  }: {
    organizationId: string;
    widgetMode?: boolean;
  }) => {
    const t = useTranslations('Chatbot');
    const { handleNewThread, isLoading, checkExistingThread } = useNewThread({
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
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          {!widgetMode && (
            <Button
              label={t('start-new-thread')}
              className="px-5 py-3 sm:mb-12 mb-8"
              onClick={handleNewThread}
              isLoading={isLoading}
              disabled={isLoading}
              iconRight={
                <RocketLaunchIcon
                  className="h-5 w-5 flex-none text-white cursor-pointer"
                  aria-hidden="true"
                />
              }
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
