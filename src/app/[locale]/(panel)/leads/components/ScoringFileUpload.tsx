'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { DocumentIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { uploadScoringFile, removeScoringFile } from '@/app/actions/leads';

const ALLOWED_EXTENSIONS = ['pdf', 'docx'];
const MAX_BYTES = 20 * 1024 * 1024;

type Props = {
  leadListPublicId: string;
  currentFileName: string | null;
};

export function ScoringFileUpload({
  leadListPublicId,
  currentFileName,
}: Props) {
  const t = useTranslations('leads-page');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setValidationError(null);
    if (!file) {
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setValidationError(t('scoring-file-error-type'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setValidationError(t('scoring-file-error-size'));
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('files', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        throw new Error('Upload failed');
      }
      const json = await res.json();
      const fileId: string = json.files?.[0]?.id ?? json.id;
      await uploadScoringFile({ leadListPublicId, fileId });
      toast.success(t('scoring-file-label'));
      router.refresh();
    } catch {
      toast.error(t('score-failed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    try {
      await removeScoringFile({ leadListPublicId });
      router.refresh();
    } catch {
      toast.error(t('score-failed'));
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <DocumentIcon className="size-4 shrink-0 text-zinc-400" />
      <span className="text-zinc-500 dark:text-zinc-400">
        {t('scoring-file-label')}:
      </span>

      {currentFileName ? (
        <>
          <span className="max-w-[180px] truncate text-zinc-700 dark:text-zinc-300">
            {currentFileName}
          </span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="text-zinc-500 hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-200"
          >
            {isUploading
              ? t('scoring-file-uploading')
              : t('scoring-file-replace')}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={isUploading}
            className="flex items-center gap-1 text-zinc-500 hover:text-red-600 disabled:opacity-50"
            aria-label={t('scoring-file-remove')}
          >
            <XMarkIcon className="size-4" />
            <span>{t('scoring-file-remove')}</span>
          </button>
        </>
      ) : (
        <>
          <span className="text-zinc-400 dark:text-zinc-500">
            {t('scoring-file-none')}
          </span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {isUploading
              ? t('scoring-file-uploading')
              : t('scoring-file-upload')}
          </button>
        </>
      )}

      {validationError && (
        <span className="text-xs text-red-600 dark:text-red-400">
          {validationError}
        </span>
      )}

      <input
        ref={inputRef}
        type="file"
        onChange={handleFileChange}
        className="sr-only"
      />
    </div>
  );
}
