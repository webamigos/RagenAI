'use client';

import { useTranslations } from 'next-intl';
import { FileType } from '@/generated/prisma/browser';

import { FilterChip, type FilterOption } from './FilterChip';

/**
 * The extensions, not the enum names. `MARKDOWN` is `MD` on every file row
 * and in every file dialog, and a filter that spells it differently reads as
 * a different thing.
 */
const FILE_TYPE_OPTIONS: readonly FilterOption<FileType>[] = [
  { value: FileType.PDF, label: 'PDF' },
  { value: FileType.DOCX, label: 'DOCX' },
  { value: FileType.MARKDOWN, label: 'MD' },
  { value: FileType.TEXT, label: 'TXT' },
  { value: FileType.CSV, label: 'CSV' },
  { value: FileType.XLSX, label: 'XLSX' },
  { value: FileType.PPTX, label: 'PPTX' },
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

  return (
    <FilterChip
      name={t('filter-file-type')}
      allLabel={t('filter-file-type-all')}
      options={FILE_TYPE_OPTIONS}
      selected={selected}
      onChange={onChange}
      menuWidthClassName="w-44"
      data-testid="filter-file-type"
    />
  );
}
