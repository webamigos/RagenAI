'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@ragenai/tui/dialog';
import { Button } from '@ragenai/tui/button';
import { Input } from '@ragenai/tui/input';
import { createLeadListFromCsv } from '@/app/actions/leads';

const MAX_BYTES = 10 * 1024 * 1024;

export function ImportLeadsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('leads-page');
  const router = useRouter();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setName('');
    setFile(null);
  };

  const handleClose = () => {
    if (isPending) {
      return;
    }
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (!file) {
      toast.error(t('import-error-empty'));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t('import-error-too-large'));
      return;
    }
    const captured = file;
    startTransition(async () => {
      try {
        const csv = await captured.text();
        const finalName = name.trim() || captured.name.replace(/\.csv$/i, '');
        const result = await createLeadListFromCsv({ name: finalName, csv });
        toast.success(t('import-success'));
        reset();
        onClose();
        router.push(`/leads/${result.publicId}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('import-failed');
        toast.error(message);
      }
    });
  };

  return (
    <Dialog open={open} onClose={handleClose} size="md">
      <DialogTitle>{t('import-dialog-title')}</DialogTitle>
      <DialogBody>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="leads-import-name"
              className="block text-sm font-medium text-zinc-900 dark:text-white"
            >
              {t('import-dialog-name-label')}
            </label>
            <Input
              id="leads-import-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('import-dialog-name-placeholder')}
              className="mt-1"
              disabled={isPending}
            />
          </div>
          <div>
            <label
              htmlFor="leads-import-file"
              className="block text-sm font-medium text-zinc-900 dark:text-white"
            >
              {t('import-dialog-file-label')}
            </label>
            <input
              id="leads-import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={isPending}
              className="mt-1 block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-900 hover:file:bg-zinc-200 dark:text-zinc-300 dark:file:bg-zinc-800 dark:file:text-zinc-100 dark:hover:file:bg-zinc-700"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {t('import-dialog-file-hint')}
            </p>
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={handleClose} disabled={isPending}>
          {t('cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={!file || isPending}>
          {isPending ? '…' : t('import-dialog-submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
