'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { logger } from '@/app/lib/utils/logger';
import { getChatbotFiles } from '../actions';

type OrgFile = Awaited<ReturnType<typeof getChatbotFiles>>[number];

type FileSelectorProps = {
  value: string[];
  onChange: (ids: string[]) => void;
};

const FILE_TYPE_BADGE: Record<string, string> = {
  PDF: 'PDF',
  URL: 'URL',
  DOCX: 'DOC',
  IMAGE: 'IMG',
  CSV: 'CSV',
  XLSX: 'XLS',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileRow({
  file,
  checked,
  onToggle,
}: {
  file: OrgFile;
  checked: boolean;
  onToggle: () => void;
}) {
  const badge = FILE_TYPE_BADGE[file.fileType] ?? 'TXT';
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 border-b px-4 py-2.5 last:border-b-0 transition-colors ${
        checked
          ? 'bg-brand-50 dark:bg-brand-950/30'
          : 'hover:bg-muted dark:hover:bg-muted/50'
      } border-border`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="size-4 rounded border-border accent-brand-600"
      />
      <span className="w-9 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center font-mono text-[10px] font-medium text-muted-foreground dark:bg-paper-700">
        {badge}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {file.fileName}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatSize(file.fileSize)}
      </span>
    </label>
  );
}

export function FileSelector({ value, onChange }: FileSelectorProps) {
  const t = useTranslations('settings-page.chatbots.files');
  const [files, setFiles] = useState<OrgFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getChatbotFiles()
      .then(setFiles)
      .catch((err) => {
        logger.error({ err }, 'Failed to load chatbot files');
        setFetchError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const filtered = files.filter((f) =>
    f.fileName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium text-foreground">{t('title')}</h3>
        <p className="text-xs text-muted-foreground">{t('description')}</p>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('search-placeholder')}
        className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring dark:bg-muted"
      />

      {/* File list */}
      <div className="max-h-64 overflow-y-auto rounded-md border border-border">
        {loading && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            {t('loading')}
          </p>
        )}
        {!loading && fetchError && (
          <p className="px-4 py-6 text-center text-xs text-destructive">
            {t('fetch-error')}
          </p>
        )}
        {!loading && !fetchError && filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            {t('empty')}
          </p>
        )}
        {!loading &&
          !fetchError &&
          filtered.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              checked={value.includes(file.id)}
              onToggle={() => toggle(file.id)}
            />
          ))}
      </div>

      {/* Status */}
      {!fetchError && (
        <>
          {value.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('selected-count', { count: value.length })}
            </p>
          ) : (
            <p className="rounded-md bg-pending-tint px-3 py-2 text-xs text-pending dark:bg-pending/30">
              {t('all-files-warning')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
