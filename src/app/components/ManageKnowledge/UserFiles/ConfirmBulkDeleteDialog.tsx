'use client';

import { useTranslations } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = {
  isOpen: boolean;
  isLoading?: boolean;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
};

export const ConfirmBulkDeleteDialog = ({
  isOpen,
  isLoading,
  count,
  onClose,
  onConfirm,
}: Props) => {
  const t = useTranslations('bulk-delete-modal');

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isLoading) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { count })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
            data-testid="bulk-delete-confirm"
          >
            {isLoading ? t('deleting') : t('delete', { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
