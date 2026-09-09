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
        <ul className="divide-y divide-border rounded-md border border-border">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 min-w-0">
                <DocumentIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {prettyBytes(file.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onRemoveFile(index)}
                disabled={isUploading}
                className="ml-2 shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-40"
                aria-label={t('remove-file', { name: file.name })}
              >
                <XMarkIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>

        <div>
          {isDualContent && (
            <p className="mb-3 rounded-md bg-pending-tint px-3 py-2 text-xs text-pending dark:bg-pending/30">
              {tPii('dual-content-notice')}
            </p>
          )}
          <label
            htmlFor="dialog-pii-policy"
            className="block text-sm font-medium mb-2 text-foreground"
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
            className="bg-paper-200 text-foreground hover:bg-paper-300 dark:bg-paper-700 dark:hover:bg-paper-600"
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
