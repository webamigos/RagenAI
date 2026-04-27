'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { statusToast } from '@/app/lib/utils/toast';
import { updateFolder } from '@/app/actions/folders';
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
  const { successToast, errorToast } = statusToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [piiPolicy, setPiiPolicy] = useState<PiiPolicyValue>(
    (initialPiiPolicy as PiiPolicyValue) ?? 'TOXIC_ONLY',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setIsSubmitting(true);
    try {
      await updateFolder(folderId, {
        name: name.trim(),
        piiPolicy: piiPolicy as PiiPolicy,
      });
      successToast({ message: 'Folder updated' });
      onClose();
      onUpdated();
    } catch {
      errorToast({ message: 'Failed to update folder' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <DialogTitle>Edit Folder</DialogTitle>

      <form onSubmit={handleSubmit} className="space-y-6 mt-6">
        <div>
          <label
            htmlFor="edit-folder-name"
            className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
          >
            Folder Name
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
            PII Masking Policy
          </label>
          <PiiPolicySelect
            id="edit-folder-pii-policy"
            value={piiPolicy}
            onChange={setPiiPolicy}
            disabled={isSubmitting}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Changes apply to new files uploaded into this folder. Existing files
            are not affected.
          </p>
        </div>

        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </Button>
          <Button isSubmit={true} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
