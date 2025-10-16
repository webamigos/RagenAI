'use client';

import { useState } from 'react';
import { toast } from 'react-toastify';
import { useTranslations } from 'next-intl';

import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
  Input,
} from '@ragenai/common-ui';
import { Clipboard, ClipboardChecked } from '@ragenai/common-ui/icons';

type Props = {
  isOpen: boolean;
  apiKey: string;
  onClose: () => void;
};

export const ApiKeyModal = ({ isOpen, apiKey, onClose }: Props) => {
  const t = useTranslations('api-keys');
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey);
    setIsCopied(true);
    toast.success(t('dialog.api-key-generated.copied'));
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <Dialog onClose={onClose} size="lg" open={isOpen}>
      <DialogTitle>{t('dialog.api-key-generated.title')}</DialogTitle>
      <DialogBody>
        <div className="space-y-4 w-full">
          <p className="text-sm text-gray-600 dark:text-gray-200">
            {t('dialog.api-key-generated.description')}
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input value={apiKey} readOnly className="font-mono p-2" />
            </div>
            <Button
              onClick={handleCopy}
              iconRight={isCopied ? <ClipboardChecked /> : <Clipboard />}
              plain
            >
              {t('copy')}
            </Button>
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <button
          onClick={onClose}
          className="bg-transparent text-primary shadow-none pr-2"
        >
          {t('done')}
        </button>
      </DialogActions>
    </Dialog>
  );
};
