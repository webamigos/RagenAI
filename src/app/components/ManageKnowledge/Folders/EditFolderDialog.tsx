'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { statusToast } from '@/app/lib/utils/toast';
import { updateFolder, reembedFolderAction } from '@/app/actions/folders';
import { PiiPolicySelect, type PiiPolicyValue } from '../PiiPolicySelect';
import type { PiiPolicy } from '@/generated/prisma/browser';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  folderId: string;
  initialName: string;
  initialPiiPolicy?: PiiPolicy | null;
  onUpdated: () => void;
};

export function EditFolderDialog({
  isOpen,
  onClose,
  folderId,
  initialName,
  initialPiiPolicy,
  onUpdated,
}: Props) {
  const t = useTranslations('folders');
  const tPii = useTranslations('pii-policy');
  const { successToast, errorToast } = statusToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [piiPolicy, setPiiPolicy] = useState<PiiPolicyValue>(
    (initialPiiPolicy as PiiPolicyValue) ?? 'TOXIC_ONLY',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReembedConfirm, setShowReembedConfirm] = useState(false);
  const [pendingName, setPendingName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setPiiPolicy((initialPiiPolicy as PiiPolicyValue) ?? 'TOXIC_ONLY');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen, initialName, initialPiiPolicy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }

    const policyChanged =
      piiPolicy !== ((initialPiiPolicy as PiiPolicyValue) ?? 'TOXIC_ONLY');

    if (policyChanged) {
      setPendingName(name.trim());
      setShowReembedConfirm(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await updateFolder(folderId, {
        name: name.trim(),
        piiPolicy: piiPolicy as PiiPolicy,
      });
      successToast({ message: t('folder-updated') });
      onClose();
      onUpdated();
    } catch {
      errorToast({ message: t('failed-to-update') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReembedConfirm = async () => {
    setShowReembedConfirm(false);
    setIsSubmitting(true);
    try {
      await updateFolder(folderId, { name: pendingName });
      const result = await reembedFolderAction(
        folderId,
        piiPolicy as PiiPolicy,
      );

      if (result.total === 0) {
        successToast({ message: t('reembed-empty') });
      } else if (result.failed.length > 0) {
        successToast({
          message: t('reembed-partial', {
            succeeded: result.succeeded.length,
            total: result.total,
            failed: result.failed.length,
          }),
        });
      } else {
        successToast({
          message: t('reembed-success', {
            succeeded: result.succeeded.length,
            total: result.total,
          }),
        });
      }
      onClose();
      onUpdated();
    } catch {
      errorToast({ message: t('failed-to-update') });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onClose={onClose} size="md">
        <DialogTitle>{t('edit-title')}</DialogTitle>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          <div>
            <label
              htmlFor="edit-folder-name"
              className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
            >
              {t('folder-name-label')}
            </label>
            <Input
              id="edit-folder-name"
              type="text"
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label
              htmlFor="edit-folder-pii-policy"
              className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
            >
              {tPii('label')}
            </label>
            <PiiPolicySelect
              id="edit-folder-pii-policy"
              value={piiPolicy}
              onChange={setPiiPolicy}
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('pii-policy-hint')}
            </p>
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              {t('cancel')}
            </Button>
            <Button isSubmit={true} disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={showReembedConfirm}
        onClose={() => setShowReembedConfirm(false)}
        size="md"
      >
        <DialogTitle>{t('reembed-confirm-title')}</DialogTitle>
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          {t('reembed-confirm-body')}
        </p>
        <div className="flex justify-end space-x-2 mt-6">
          <Button
            type="button"
            onClick={() => setShowReembedConfirm(false)}
            className="bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            {t('cancel')}
          </Button>
          <Button type="button" onClick={handleReembedConfirm}>
            {t('reembed-confirm-action')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
