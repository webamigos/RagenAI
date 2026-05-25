'use client';

import { useTransition } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogActions,
} from '@ragenai/tui/dialog';
import { Button } from '@ragenai/tui/button';
import { deleteLeadList } from '@/app/actions/leads';
import type { LeadListSummary } from '@/features/leads/contracts/lead-list.types';

export function DeleteLeadListDialog({
  list,
  onClose,
}: {
  list: LeadListSummary | null;
  onClose: () => void;
}) {
  const t = useTranslations('leads-page');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    if (!list) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteLeadList({ publicId: list.publicId });
        onClose();
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t('delete-failed'),
        );
      }
    });
  };

  return (
    <Dialog open={list !== null} onClose={onClose} size="sm">
      <DialogTitle>{t('delete-confirm-title')}</DialogTitle>
      <DialogDescription>
        {list ? t('delete-confirm-description', { name: list.name }) : ''}
      </DialogDescription>
      <DialogActions>
        <Button plain onClick={onClose} disabled={isPending}>
          {t('cancel')}
        </Button>
        <Button color="red" onClick={handleConfirm} disabled={isPending}>
          {t('delete-confirm-button')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
