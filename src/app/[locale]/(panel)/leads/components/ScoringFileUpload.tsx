'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import {
  DocumentIcon,
  EllipsisVerticalIcon,
  ArrowUpTrayIcon,
  ArrowPathIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { uploadScoringFile, removeScoringFile } from '@/app/actions/leads';

const ALLOWED_EXTENSIONS = ['pdf', 'docx'];
const MAX_BYTES = 20 * 1024 * 1024;

type Props = {
  leadListPublicId: string;
  currentFileName: string | null;
};

// Compact scoring-file control for the leads detail header.
// - No file: a small "Upload" pill-button (icon + label, nowrap).
// - With file: a chip showing icon + truncated filename, plus a kebab
//   menu with Replace / Remove. Full filename is in the title attribute.
export function ScoringFileUpload({
  leadListPublicId,
  currentFileName,
}: Props) {
  const t = useTranslations('leads-page');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const openFilePicker = () => {
    setMenuOpen(false);
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    if (!file) {
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error(t('scoring-file-error-type'));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t('scoring-file-error-size'));
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
      const fileId: string =
        json.files?.[0]?.uniqueFileId ?? json.files?.[0]?.id ?? json.id;
      await uploadScoringFile({ leadListPublicId, fileId });
      router.refresh();
    } catch {
      toast.error(t('score-failed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    setMenuOpen(false);
    try {
      await removeScoringFile({ leadListPublicId });
      router.refresh();
    } catch {
      toast.error(t('score-failed'));
    }
  };

  // Hidden file input — shared by both states.
  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".pdf,.docx"
      onChange={handleFileChange}
      className="sr-only"
    />
  );

  if (!currentFileName) {
    return (
      <>
        <button
          type="button"
          onClick={openFilePicker}
          disabled={isUploading}
          title={t('scoring-file-label')}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {isUploading ? (
            <ArrowPathIcon className="size-3.5 animate-spin" />
          ) : (
            <ArrowUpTrayIcon className="size-3.5" />
          )}
          {isUploading ? t('scoring-file-uploading') : t('scoring-file-upload')}
        </button>
        {fileInput}
      </>
    );
  }

  return (
    <>
      <div
        className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 py-1 pl-2 pr-1 text-xs dark:border-zinc-800 dark:bg-zinc-900"
        title={currentFileName}
      >
        <DocumentIcon className="size-3.5 shrink-0 text-zinc-400" />
        <span className="max-w-[160px] truncate text-zinc-700 dark:text-zinc-300">
          {currentFileName}
        </span>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('scoring-file-label')}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              {isUploading ? (
                <ArrowPathIcon className="size-3.5 animate-spin" />
              ) : (
                <EllipsisVerticalIcon className="size-3.5" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <button
              type="button"
              onClick={openFilePicker}
              disabled={isUploading}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <ArrowUpTrayIcon className="size-3.5" />
              {t('scoring-file-replace')}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={isUploading}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <TrashIcon className="size-3.5" />
              {t('scoring-file-remove')}
            </button>
          </PopoverContent>
        </Popover>
      </div>
      {fileInput}
    </>
  );
}
