'use client';

import { useTranslations } from 'next-intl';
import { EmbeddingStatus } from '@/generated/prisma/browser';

import { FilterChip, type FilterOption } from './FilterChip';

/**
 * The four states worth filtering by, listed rather than derived.
 *
 * `EmbeddingStatus` has a fifth member, `CANCELLED`, written by the worker
 * when a run is stopped. It has never been offered here and this change does
 * not add it — that is a product decision about whether a cancelled ingest is
 * something people go looking for, and it needs its own label.
 *
 * Listed because the old version built the message key from the enum value by
 * lower-casing it and replacing one underscore. That happened to work for
 * `NOT_STARTED` and would have produced a missing key, silently, for any
 * member with two.
 */
const STATUS_OPTIONS: readonly { value: EmbeddingStatus; labelKey: string }[] =
  [
    {
      value: EmbeddingStatus.NOT_STARTED,
      labelKey: 'filter-status-not-started',
    },
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

  const options: readonly FilterOption<EmbeddingStatus>[] = STATUS_OPTIONS.map(
    ({ value, labelKey }) => ({
      value,
      label: t(labelKey as Parameters<typeof t>[0]),
    }),
  );

  return (
    <FilterChip
      name={t('filter-embedding-status')}
      allLabel={t('filter-embedding-status-all')}
      options={options}
      selected={selected}
      onChange={onChange}
      menuWidthClassName="w-48"
      data-testid="filter-embedding-status"
    />
  );
}
