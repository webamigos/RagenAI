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
} from '@ragenai/tui/pagination';
import {
  ChevronUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/20/solid';
import type {
  FileType,
  EmbeddingStatus,
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
};

type DocumentsTableWithFiltersProps = CommonProps & {
  subfolders?: DocumentFolderItem[];
  onNavigateFolder?: (folderId: string) => void;
};

type DocumentsGridWithFiltersProps = Pick<
  CommonProps,
  'result' | 'sort' | 'dir' | 'selectedFileTypes' | 'selectedStatuses'
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
        className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        {t('sort-label')}: {t(activeLabel as Parameters<typeof t>[0])}
        {dir === 'asc' ? (
          <ChevronUpIcon className="ml-1 size-3.5" />
        ) : (
          <ChevronDownIcon className="ml-1 size-3.5" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {SORT_COLUMNS.map((col) => (
            <div key={col.value}>
              <button
                type="button"
                onClick={() => {
                  onSort(col.value, 'asc');
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${sort === col.value && dir === 'asc' ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}
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
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${sort === col.value && dir === 'desc' ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}
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
  isFilteredEmpty = false,
  children,
}: {
  result: PaginatedUserFilesResult;
  sort?: UserFilesSort;
  dir?: UserFilesSortDir;
  onSort?: (col: UserFilesSort, newDir: UserFilesSortDir) => void;
  selectedFileTypes: FileType[];
  selectedStatuses: EmbeddingStatus[];
  isFilteredEmpty?: boolean;
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

  const handleResetFilters = useCallback(() => {
    router.push(
      buildUrl(pathname, getParams(), {
        fileType: null,
        embeddingStatus: null,
        page: '1',
      }),
    );
  }, [router, pathname]);

  const hasActiveFilters =
    selectedFileTypes.length > 0 || selectedStatuses.length > 0;

  const pageHref = (p: number) =>
    buildUrl(pathname, getParams(), { page: String(p) });

  const visiblePages = buildVisiblePages(result.page, result.totalPages);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
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
        {hasActiveFilters && !isFilteredEmpty && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-sm text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {t('reset-filters')}
          </button>
        )}
      </div>

      {children}

      {result.totalPages > 1 && (
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {t('pagination-info', {
              page: result.page,
              totalPages: result.totalPages,
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

  const handleResetFilters = useCallback(() => {
    router.push(
      buildUrl(pathname, getParams(), {
        fileType: null,
        embeddingStatus: null,
        page: '1',
      }),
    );
  }, [router, pathname]);

  const SortIcon = ({ column }: { column: UserFilesSort }) => {
    if (sort !== column) {
      return (
        <ChevronUpDownIcon className="ml-1 inline size-3.5 text-gray-400" />
      );
    }
    if (dir === 'asc') {
      return (
        <ChevronUpIcon className="ml-1 inline size-3.5 text-indigo-700 dark:text-indigo-300" />
      );
    }
    return (
      <ChevronDownIcon className="ml-1 inline size-3.5 text-indigo-700 dark:text-indigo-300" />
    );
  };

  const isFilteredEmptyVal =
    result.items.length === 0 &&
    (selectedFileTypes.length > 0 || selectedStatuses.length > 0);

  return (
    <FiltersBar
      result={result}
      selectedFileTypes={selectedFileTypes}
      selectedStatuses={selectedStatuses}
      isFilteredEmpty={isFilteredEmptyVal}
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
    (selectedFileTypes.length > 0 || selectedStatuses.length > 0);

  return (
    <FiltersBar
      result={result}
      sort={sort}
      dir={dir}
      onSort={handleSort}
      selectedFileTypes={selectedFileTypes}
      selectedStatuses={selectedStatuses}
      isFilteredEmpty={isFilteredEmptyVal}
    >
      {children}
    </FiltersBar>
  );
}
