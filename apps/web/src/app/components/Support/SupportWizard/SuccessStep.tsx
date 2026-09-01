'use client';

import { useTranslations } from 'next-intl';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { Button } from '@ragenai/common-ui/Button';

type Props = {
  context: 'page' | 'modal';
  onReset: () => void;
  onClose?: () => void;
};

export const SuccessStep = ({ context, onReset, onClose }: Props) => {
  const t = useTranslations('support-page.wizard');

  return (
    <div className="flex flex-col items-center text-center py-4 gap-4">
      <CheckCircleIcon className="size-12 text-green-500" />
      <div>
        <p className="text-base font-semibold text-zinc-900 dark:text-white">
          {t('success-title')}
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {t('success-message')}
        </p>
      </div>
      <div className="flex gap-3 w-full">
        <Button type="button" plain onClick={onReset} className="flex-1">
          {t('new-ticket')}
        </Button>
        {context === 'modal' && onClose && (
          <Button type="button" onClick={onClose} className="flex-1">
            {t('close')}
          </Button>
        )}
      </div>
    </div>
  );
};
