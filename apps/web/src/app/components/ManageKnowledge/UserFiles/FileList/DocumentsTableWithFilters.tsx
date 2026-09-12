'use client';

import { useCallback, useRef, useState } from 'react';
import { useOnClickOutside } from '@/app/hooks/useOnClickOutside';
import { useRouter, usePathname } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import {
  Pagination,
  PaginationPrevious,
  PaginationNext,
  PaginationList,
  PaginationPage,
  PaginationGap,
} from '@ragenai/common-ui/Pagination';
import {
  ChevronUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/20/solid';
import type {
  FileType,
  EmbeddingStatus,
  PiiPolicy,
  UserFile,
} from '@/generated/prisma/browser';
import type {
  PaginatedUserFilesResult,
  UserFilesSort,
  UserFilesSortDir,
  DocumentFolderItem,
  UserFileType,
} from '@/features/documents/contracts/document.types';
import type { ModalStateProps, UserFileTypeSafe } from './UserFilesTable';
import { UserFilesTable } from './UserFilesTable';
import { FileTypeFilterDropdown } from './FileTypeFilterDropdown';
import { EmbeddingStatusFilterDropdown } from './EmbeddingStatusFilterDropdown';
import { PiiPolicyFilterDropdown } from './PiiPolicyFilterDropdown';
import { clearFileFilterParams } from '@/features/documents/constants/file-filters';

function buildUrl(
  pathname: string,
  params: URLSearchParams,
  overrides: Record<string, string | string[] | null>,
): string {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      next.delete(key);
    } else if (Array.isArray(value)) {
      next.set(key, value.join(','));
    } else {
      next.set(key, value);
    }
  }
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function buildVisiblePages(current: number, total: number): (number | null)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | null)[] = [1];
  if (current > 3) {
    pages.push(null);
  }
  for (
    let p = Math.max(2, current - 1);
    p <= Math.min(total - 1, current + 1);
    p++
  ) {
    pages.push(p);
  }
  if (current < total - 2) {
    pages.push(null);
  }
  pages.push(total);
  return pages;
}

type CommonProps = {
  result: PaginatedUserFilesResult;
  files?: UserFileType[];
  sort: UserFilesSort;
  dir: UserFilesSortDir;
  selectedFileTypes: FileType[];
  selectedStatuses: EmbeddingStatus[];
  selectedPolicies: PiiPolicy[];
  showModal: ModalStateProps;
  deleteLoading: boolean;
  toggleModal: (fileId: UserFile['id'] | null) => void;
  addFile: (newFile: UserFileType) => void;
  removeFile: (fileId: UserFile['id']) => void;
  handleDelete: (
    fileId: UserFile['id'],
    fileName: UserFile['fileName'],
  ) => void;
  isSelected?: (id: string) => boolean;
  isAllSelected?: (ids: string[]) => boolean;
  isIndeterminate?: (ids: string[]) => boolean;
  onToggleFile?: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
  onUpload?: () => void;
  onCreateDocument?: () => void;
  onAddFromUrl?: () => void;
  onPreviewFile?: (file: UserFileTypeSafe) => void;
  canManageOrg?: boolean;
  /** Rendered inside the filter row — see `FiltersBar`. */
  search?: React.ReactNode;
  viewToggle?: React.ReactNode;
  selectionBar?: React.ReactNode;
};

type DocumentsTableWithFiltersProps = CommonProps & {
  subfolders?: DocumentFolderItem[];
  onNavigateFolder?: (folderId: string) => void;
};

type DocumentsGridWithFiltersProps = Pick<
  CommonProps,
  | 'result'
  | 'sort'
  | 'dir'
  | 'selectedFileTypes'
  | 'selectedStatuses'
  | 'selectedPolicies'
  | 'search'
  | 'viewToggle'
  | 'selectionBar'
> & {
  children: React.ReactNode;
};

const SORT_COLUMNS: { value: UserFilesSort; labelKey: string }[] = [
  { value: 'fileName', labelKey: 'sort-file-name' },
  { value: 'createdAt', labelKey: 'sort-created' },
  { value: 'fileSize', labelKey: 'sort-file-size' },
  { value: 'fileType', labelKey: 'sort-file-type' },
];

function SortDropdown({
  sort,
  dir,
  onSort,
}: {
  sort: UserFilesSort;
  dir: UserFilesSortDir;
  onSort: (col: UserFilesSort, newDir: UserFilesSortDir) => void;
}) {
  const t = useTranslations('files-table');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOnClickOutside(ref, () => setOpen(false));

  const activeLabel =
    SORT_COLUMNS.find((c) => c.value === sort)?.labelKey ?? 'sort-file-name';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-muted dark:bg-muted dark:hover:bg-paper-700"
      >
        {t('sort-label')}: {t(activeLabel as Parameters<typeof t>[0])}
        {dir === 'asc' ? (
          <ChevronUpIcon className="ml-1 size-3.5" />
        ) : (
          <ChevronDownIcon className="ml-1 size-3.5" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded-md border border-border bg-card shadow-lg dark:bg-muted">
          {SORT_COLUMNS.map((col) => (
            <div key={col.value}>
              <button
                type="button"
                onClick={() => {
                  onSort(col.value, 'asc');
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted dark:hover:bg-muted ${sort === col.value && dir === 'asc' ? 'font-semibold text-primary dark:text-primary' : 'text-foreground'}`}
              >
                <ChevronUpIcon className="size-3.5 shrink-0" />
                {t(col.labelKey as Parameters<typeof t>[0])} -{' '}
                {t('sort-dir-asc')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSort(col.value, 'desc');
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted dark:hover:bg-muted ${sort === col.value && dir === 'desc' ? 'font-semibold text-primary dark:text-primary' : 'text-foreground'}`}
              >
                <ChevronDownIcon className="size-3.5 shrink-0" />
                {t(col.labelKey as Parameters<typeof t>[0])} -{' '}
                {t('sort-dir-desc')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FiltersBar({
  result,
  sort,
  dir,
  onSort,
  selectedFileTypes,
  selectedStatuses,
  selectedPolicies,
  isFilteredEmpty = false,
  search,
  viewToggle,
  selectionBar,
  children,
}: {
  result: PaginatedUserFilesResult;
  sort?: UserFilesSort;
  dir?: UserFilesSortDir;
  onSort?: (col: UserFilesSort, newDir: UserFilesSortDir) => void;
  selectedFileTypes: FileType[];
  selectedStatuses: EmbeddingStatus[];
  selectedPolicies: PiiPolicy[];
  isFilteredEmpty?: boolean;
  /** Renders first in the filter row — it narrows the same set the chips do. */
  search?: React.ReactNode;
  /** Renders at the far end of the filter row, pushed there by a spacer. */
  viewToggle?: React.ReactNode;
  /**
   * Sits between the filter row and the table, so the count and its actions
   * are adjacent to the checkboxes that filled them. Phase 7 puts it directly
   * above the header rather than above the filters.
   */
  selectionBar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('files-table');

  const getParams = () =>
    new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : '',
    );

  const handleFileTypeChange = useCallback(
    (types: FileType[]) => {
      router.push(
        buildUrl(pathname, getParams(), {
          fileType: types.map(String),
          page: '1',
        }),
      );
    },
    [router, pathname],
  );

  const handleStatusChange = useCallback(
    (statuses: EmbeddingStatus[]) => {
      router.push(
        buildUrl(pathname, getParams(), {
          embeddingStatus: statuses.map(String),
          page: '1',
        }),
      );
    },
    [router, pathname],
  );

  const handlePolicyChange = useCallback(
    (policies: PiiPolicy[]) => {
      router.push(
        buildUrl(pathname, getParams(), {
          piiPolicy: policies.map(String),
          page: '1',
        }),
      );
    },
    [router, pathname],
  );

  const handleResetFilters = useCallback(() => {
    const params = getParams();
    clearFileFilterParams(params);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname]);

  const hasActiveFilters =
    selectedFileTypes.length > 0 ||
    selectedStatuses.length > 0 ||
    selectedPolicies.length > 0;

  const pageHref = (p: number) =>
    buildUrl(pathname, getParams(), { page: String(p) });

  const visiblePages = buildVisiblePages(result.page, result.totalPages);

  // The range the current page covers.
  //
  // `to` is clamped to the total so the last page reads "26-31 of 31" rather
  // than running past it, and a `page` beyond the end reads "0-0 of 31"
  // rather than "24951-31 of 31". `page` comes from the query string and is
  // only floored at 1, so `?page=999` on a two-page list is reachable by
  // typing — the table is empty there, and the range says so.
  const firstOnPage = (result.page - 1) * result.pageSize + 1;
  const isPastEnd = firstOnPage > result.totalCount;
  const rangeFrom = result.totalCount === 0 || isPastEnd ? 0 : firstOnPage;
  const rangeTo = isPastEnd
    ? 0
    : Math.min(result.page * result.pageSize, result.totalCount);

  return (
    <div className="flex flex-col gap-3">
      {/*
        Search and the chips are one row, because they are one question: each
        narrows the same set, and splitting them put a text field in a row of
        its own above three controls that do the same job. The view toggle sits
        at the far end — it changes how the answer is drawn, not what it is.
      */}
      <div className="flex items-center gap-2 flex-wrap">
        {search}
        {sort !== undefined && dir !== undefined && onSort !== undefined && (
          <SortDropdown sort={sort} dir={dir} onSort={onSort} />
        )}
        <FileTypeFilterDropdown
          selected={selectedFileTypes}
          onChange={handleFileTypeChange}
        />
        <EmbeddingStatusFilterDropdown
          selected={selectedStatuses}
          onChange={handleStatusChange}
        />
        <PiiPolicyFilterDropdown
          selected={selectedPolicies}
          onChange={handlePolicyChange}
        />
        {hasActiveFilters && !isFilteredEmpty && (
          /*
            "Clear all", not "Reset filters": beside the chips it is clear what
            it clears, and the shorter word is the design's. The empty state
            keeps `reset-filters`, where a bare "Clear all" would sit next to
            a table of nothing and read as an offer to clear the files.
          */
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            {t('clear-all-filters')}
          </button>
        )}
        {viewToggle && (
          <>
            <div className="flex-1" />
            {viewToggle}
          </>
        )}
      </div>

      {selectionBar}

      {children}

      {/*
        Also when the requested page is past the end, which is the one case
        where the controls are the way out: `?page=999` on a single-page list
        renders an empty table, and without this the only thing on screen
        saying so would be gone with them.
      */}
      {(result.totalPages > 1 || result.page > result.totalPages) && (
        <div className="flex items-center justify-between mt-2">
          {/*
            "1-5 of 240" rather than "Page 1 of 48". The number people look for
            here is how many rows the current filter left, and which of them
            they are looking at; the page ordinal is already in the control to
            the right of it.
          */}
          <span className="text-sm tabular-nums text-muted-foreground">
            {t('pagination-range', {
              from: rangeFrom,
              to: rangeTo,
              total: result.totalCount,
            })}
          </span>
          <Pagination aria-label="Page navigation">
            <PaginationPrevious
              href={result.page > 1 ? pageHref(result.page - 1) : null}
            />
            <PaginationList>
              {visiblePages.map((p, i) =>
                p === null ? (
                  <PaginationGap key={`gap-${i}`} />
                ) : (
                  <PaginationPage
                    key={p}
                    href={pageHref(p)}
                    current={p === result.page}
                  >
                    {p}
                  </PaginationPage>
                ),
              )}
            </PaginationList>
            <PaginationNext
              href={
                result.page < result.totalPages
                  ? pageHref(result.page + 1)
                  : null
              }
            />
          </Pagination>
        </div>
      )}
    </div>
  );
}

export function DocumentsTableWithFilters({
  result,
  files,
  sort,
  dir,
  selectedFileTypes,
  selectedStatuses,
  selectedPolicies,
  subfolders,
  onNavigateFolder,
  showModal,
  deleteLoading,
  toggleModal,
  addFile,
  removeFile,
  handleDelete,
  isSelected,
  isAllSelected,
  isIndeterminate,
  onToggleFile,
  onToggleAll,
  onUpload,
  onCreateDocument,
  onAddFromUrl,
  onPreviewFile,
  canManageOrg,
  search,
  viewToggle,
  selectionBar,
}: DocumentsTableWithFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  const getParams = () =>
    new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : '',
    );

  const handleSort = useCallback(
    (column: UserFilesSort) => {
      const newDir: UserFilesSortDir =
        sort === column && dir === 'asc' ? 'desc' : 'asc';
      router.push(
        buildUrl(pathname, getParams(), {
          sort: column,
          dir: newDir,
          page: '1',
        }),
      );
    },
    [sort, dir, router, pathname],
  );

  const handlePolicyChange = useCallback(
    (policies: PiiPolicy[]) => {
      router.push(
        buildUrl(pathname, getParams(), {
          piiPolicy: policies.map(String),
          page: '1',
        }),
      );
    },
    [router, pathname],
  );

  const handleResetFilters = useCallback(() => {
    const params = getParams();
    clearFileFilterParams(params);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname]);

  const SortIcon = ({ column }: { column: UserFilesSort }) => {
    if (sort !== column) {
      return (
        <ChevronUpDownIcon className="ml-1 inline size-3.5 text-muted-foreground" />
      );
    }
    if (dir === 'asc') {
      return (
        <ChevronUpIcon className="ml-1 inline size-3.5 text-brand-700 dark:text-brand-300" />
      );
    }
    return (
      <ChevronDownIcon className="ml-1 inline size-3.5 text-brand-700 dark:text-brand-300" />
    );
  };

  const isFilteredEmptyVal =
    result.items.length === 0 &&
    (selectedFileTypes.length > 0 ||
      selectedStatuses.length > 0 ||
      selectedPolicies.length > 0);

  return (
    <FiltersBar
      result={result}
      selectedFileTypes={selectedFileTypes}
      selectedStatuses={selectedStatuses}
      selectedPolicies={selectedPolicies}
      isFilteredEmpty={isFilteredEmptyVal}
      search={search}
      viewToggle={viewToggle}
      selectionBar={selectionBar}
    >
      <UserFilesTable
        files={files ?? result.items}
        subfolders={subfolders}
        onNavigateFolder={onNavigateFolder}
        showModal={showModal}
        deleteLoading={deleteLoading}
        toggleModal={toggleModal}
        onAddFile={addFile}
        onRemoveFile={removeFile}
        handleDelete={handleDelete}
        isSelected={isSelected}
        isAllSelected={isAllSelected}
        isIndeterminate={isIndeterminate}
        onToggleFile={onToggleFile}
        onToggleAll={onToggleAll}
        onUpload={onUpload}
        onCreateDocument={onCreateDocument}
        onAddFromUrl={onAddFromUrl}
        onPreviewFile={onPreviewFile}
        sort={sort}
        dir={dir}
        onSort={handleSort}
        SortIcon={SortIcon}
        isFilteredEmpty={isFilteredEmptyVal}
        onResetFilters={handleResetFilters}
        canManageOrg={canManageOrg}
      />
    </FiltersBar>
  );
}

export function DocumentsGridWithFilters({
  result,
  sort,
  dir,
  selectedFileTypes,
  selectedStatuses,
  selectedPolicies,
  search,
  viewToggle,
  selectionBar,
  children,
}: DocumentsGridWithFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  const getParams = () =>
    new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : '',
    );

  const handleSort = useCallback(
    (col: UserFilesSort, newDir: UserFilesSortDir) => {
      router.push(
        buildUrl(pathname, getParams(), {
          sort: col,
          dir: newDir,
          page: '1',
        }),
      );
    },
    [router, pathname],
  );

  const isFilteredEmptyVal =
    result.items.length === 0 &&
    (selectedFileTypes.length > 0 ||
      selectedStatuses.length > 0 ||
      selectedPolicies.length > 0);

  return (
    <FiltersBar
      result={result}
      sort={sort}
      dir={dir}
      onSort={handleSort}
      selectedFileTypes={selectedFileTypes}
      selectedStatuses={selectedStatuses}
      selectedPolicies={selectedPolicies}
      isFilteredEmpty={isFilteredEmptyVal}
      search={search}
      viewToggle={viewToggle}
      selectionBar={selectionBar}
    >
      {children}
    </FiltersBar>
  );
}
