'use client';

import { useTranslations } from 'next-intl';
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
      <DialogTitle>{t('header')}</DialogTitle>
      <DialogBody>
        <SupportWizard context="modal" onClose={onClose} />
      </DialogBody>
    </Dialog>
  );
};
