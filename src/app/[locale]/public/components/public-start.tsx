'use client';

import { useTranslations } from 'next-intl';
import { RocketLaunchIcon } from '@heroicons/react/24/outline';

import { Button } from '@ragenai/common-ui';
import { useNewThread } from '../hooks/useNewThread';

export const PublicStart = ({ organizationId }: { organizationId: string }) => {
  const t = useTranslations('Index');
  const { handleNewThread, isLoading } = useNewThread({ organizationId });

  return (
    <div className="container mx-auto h-full">
      <div className="flex flex-col h-full items-center justify-center">
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
      </div>
    </div>
  );
};
