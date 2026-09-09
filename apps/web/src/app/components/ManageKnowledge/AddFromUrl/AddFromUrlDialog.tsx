'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { statusToast } from '@/app/lib/utils/toast';
import { processUrl } from './actions';
import { WebsiteLoaderMode } from '@/features/documents/contracts/document.types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AddFromUrlDialog({ isOpen, onClose, onSuccess }: Props) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations('add-from-url');
  const { successToast, errorToast } = statusToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await processUrl(trimmed, WebsiteLoaderMode.SCRAPE);
      if (result.success) {
        successToast({ message: t('success-message') });
        setUrl('');
        onSuccess();
      } else {
        errorToast({ message: result.message || t('error-message') });
      }
    } catch {
      errorToast({ message: t('error-message') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setUrl('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} size="md">
      <DialogTitle>{t('title')}</DialogTitle>

      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        <Input
          type="text"
          placeholder={t('url-placeholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isLoading}
        />

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="bg-muted text-foreground hover:bg-muted dark:text-foreground dark:hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            isSubmit={true}
            isLoading={isLoading}
            disabled={isLoading || !url.trim()}
          >
            {isLoading ? t('button-processing') : t('button-process')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
