'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { FileType } from '@/generated/prisma/browser';

const FILE_TYPE_OPTIONS: { value: FileType; label: string }[] = [
  { value: FileType.PDF, label: 'PDF' },
  { value: FileType.DOCX, label: 'DOCX' },
  { value: FileType.MARKDOWN, label: 'MD' },
  { value: FileType.TEXT, label: 'TXT' },
  { value: FileType.CSV, label: 'CSV' },
  { value: FileType.XLSX, label: 'XLSX' },
  { value: FileType.IMAGE, label: 'Image' },
  { value: FileType.URL, label: 'URL' },
  { value: FileType.EPUB, label: 'EPUB' },
  { value: FileType.SRT, label: 'SRT' },
];

type Props = {
  selected: FileType[];
  onChange: (types: FileType[]) => void;
};

export function FileTypeFilterDropdown({ selected, onChange }: Props) {
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

  const toggle = (value: FileType) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const label =
    selected.length === 0 ? t('filter-file-type-all') : selected.join(', ');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <span>
          {t('filter-file-type')}: {label}
        </span>
        <ChevronDownIcon className="size-4 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-44 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {FILE_TYPE_OPTIONS.map(({ value, label: optLabel }) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <input
                type="checkbox"
                checked={selected.includes(value)}
                onChange={() => toggle(value)}
                className="size-4 rounded border-gray-300 accent-blue-600"
              />
              {optLabel}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
