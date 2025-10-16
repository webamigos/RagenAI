'use client';

import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@ragenai/common-ui';
import { useTranslations } from 'next-intl';

type Props = {
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

// TODO: translations
export const RemoveApiKeyDialog = ({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  isPending = false,
}: Props) => {
  const t = useTranslations('api-keys.dialog');

  return (
    <Dialog onClose={onClose} size="sm" open={isOpen}>
      <DialogTitle>{t('remove-key.title')}</DialogTitle>
      <DialogBody>
        <DialogDescription>{t('remove-key.description')}</DialogDescription>
      </DialogBody>
      <DialogActions>
        <Button onClick={onCancel} plain>
          {t('cancel')}
        </Button>
        <Button onClick={onConfirm} isLoading={isPending} plain>
          {t('confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
