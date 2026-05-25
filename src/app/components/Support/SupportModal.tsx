'use client';

import { useTranslations } from 'next-intl';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Dialog, DialogTitle, DialogBody } from '@ragenai/common-ui/Dialog';
import { SupportWizard } from './SupportWizard';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export const SupportModal = ({ isOpen, onClose }: Props) => {
  const t = useTranslations('support-page');

  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <XMarkIcon className="size-4" />
      </button>
      <DialogTitle>{t('header')}</DialogTitle>
      <DialogBody>
        <SupportWizard context="modal" onClose={onClose} />
      </DialogBody>
    </Dialog>
  );
};
