'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { XMarkIcon, DocumentIcon } from '@heroicons/react/24/outline';
import prettyBytes from 'pretty-bytes';
import { PiiPolicySelect, type PiiPolicyValue } from '../PiiPolicySelect';
import { useOrganization } from '@/app/hooks/use-auth';

type Props = {
  isOpen: boolean;
  files: File[];
  initialPiiPolicy: PiiPolicyValue;
  isUploading: boolean;
  isDualContent?: boolean;
  onClose: () => void;
  onRemoveFile: (index: number) => void;
  onSubmit: (piiPolicy: PiiPolicyValue) => void;
};

export function UploadFilesDialog({
  isOpen,
  files,
  initialPiiPolicy,
  isUploading,
  isDualContent = false,
  onClose,
  onRemoveFile,
  onSubmit,
}: Props) {
  const t = useTranslations('admin-panel');
  const tPii = useTranslations('pii-policy');
  const tFolders = useTranslations('folders');
  const { canManageOrg } = useOrganization();
  const [piiPolicy, setPiiPolicy] = useState<PiiPolicyValue>(initialPiiPolicy);

  useEffect(() => {
    setPiiPolicy(initialPiiPolicy);
  }, [initialPiiPolicy, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(piiPolicy);
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <DialogTitle>{t('Add-files')}</DialogTitle>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 min-w-0">
                <DocumentIcon className="size-4 shrink-0 text-gray-400" />
                <span className="truncate text-gray-700 dark:text-gray-200">
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-gray-400">
                  {prettyBytes(file.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onRemoveFile(index)}
                disabled={isUploading}
                className="ml-2 shrink-0 text-gray-400 hover:text-red-500 disabled:opacity-40"
                aria-label={t('remove-file', { name: file.name })}
              >
                <XMarkIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>

        <div>
          {isDualContent && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              {tPii('dual-content-notice')}
            </p>
          )}
          <label
            htmlFor="dialog-pii-policy"
            className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
          >
            {tPii('label')}
          </label>
          <PiiPolicySelect
            id="dialog-pii-policy"
            value={piiPolicy}
            onChange={setPiiPolicy}
            disabled={isUploading}
            showInfoLink={canManageOrg}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            {tFolders('cancel')}
          </Button>
          <Button
            isSubmit={true}
            isLoading={isUploading}
            disabled={isUploading || files.length === 0}
          >
            {t('send')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
