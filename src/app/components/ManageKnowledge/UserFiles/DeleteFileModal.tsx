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
  fileName: string;
  fileId: string;
  onClose: () => void;
  onConfirm: (fileId: string, fileName: string) => void;
};

export const DeleteFileModal = ({
  isOpen,
  fileName,
  isLoading,
  fileId,
  onClose,
  onConfirm,
}: Props) => {
  const t = useTranslations('file-delete-modal');

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
          <DialogDescription>
            {t('description', { fileName })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(fileId, fileName)}
            disabled={isLoading}
          >
            {isLoading ? t('deleting') : t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
