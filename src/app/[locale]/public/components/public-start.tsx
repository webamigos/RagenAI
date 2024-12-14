'use client';

import { useTranslations } from 'next-intl';
import { RocketLaunchIcon } from '@heroicons/react/24/outline';
import { useEffect } from 'react';

import { Button } from '@ragenai/common-ui';
import { useNewThread } from '../hooks/useNewThread';

export const PublicStart = ({
  organizationId,
  widgetMode = false,
}: {
  organizationId: string;
  widgetMode?: boolean;
}) => {
  const t = useTranslations('Index');
  const { handleNewThread, isLoading } = useNewThread({
    organizationId,
  });

  // Todo: This is a hack, please fix handling thread creation in widget mode
  useEffect(() => {
    if (widgetMode) {
      handleNewThread();
    }
  }, [widgetMode]);

  return (
    <div className="container mx-auto h-full">
      <div className="flex flex-col h-full items-center justify-center">
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

        {widgetMode && isLoading && <p>Opening chat thread...</p>}
      </div>
    </div>
  );
};
