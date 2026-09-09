'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { EmbeddingStatus } from '@/generated/prisma/browser';

const STATUS_OPTIONS: { value: EmbeddingStatus; labelKey: string }[] = [
  { value: EmbeddingStatus.NOT_STARTED, labelKey: 'filter-status-not-started' },
  { value: EmbeddingStatus.STARTED, labelKey: 'filter-status-started' },
  { value: EmbeddingStatus.COMPLETED, labelKey: 'filter-status-completed' },
  { value: EmbeddingStatus.FAILED, labelKey: 'filter-status-failed' },
];

type Props = {
  selected: EmbeddingStatus[];
  onChange: (statuses: EmbeddingStatus[]) => void;
};

export function EmbeddingStatusFilterDropdown({ selected, onChange }: Props) {
  const t = useTranslations('files-table');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (value: EmbeddingStatus) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const label =
    selected.length === 0
      ? t('filter-embedding-status-all')
      : selected
          .map((s) =>
            t(
              `filter-status-${s.toLowerCase().replace('_', '-')}` as Parameters<
                typeof t
              >[0],
            ),
          )
          .join(', ');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md border border-border bg-white px-3 py-1.5 text-sm text-foreground shadow-sm hover:bg-muted dark:border-border dark:bg-muted dark:text-foreground dark:hover:bg-muted"
      >
        <span>
          {t('filter-embedding-status')}: {label}
        </span>
        <ChevronDownIcon className="size-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-48 rounded-md border border-border bg-white shadow-lg dark:border-border dark:bg-muted">
          {STATUS_OPTIONS.map(({ value, labelKey }) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted dark:hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.includes(value)}
                onChange={() => toggle(value)}
                className="size-4 rounded border-border accent-primary"
              />
              {t(labelKey as Parameters<typeof t>[0])}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
