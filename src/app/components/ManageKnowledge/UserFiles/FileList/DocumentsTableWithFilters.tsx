'use client';

import { useCallback } from 'react';
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

type Props = {
  result: PaginatedUserFilesResult;
  sort: UserFilesSort;
  dir: UserFilesSortDir;
  selectedFileTypes: FileType[];
  selectedStatuses: EmbeddingStatus[];
  subfolders?: DocumentFolderItem[];
  onNavigateFolder?: (folderId: string) => void;
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
};

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

export function DocumentsTableWithFilters({
  result,
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
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('files-table');

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

  const SortIcon = ({ column }: { column: UserFilesSort }) => {
    if (sort !== column) {
      return (
        <ChevronUpDownIcon className="ml-1 inline size-3.5 text-gray-400" />
      );
    }
    if (dir === 'asc') {
      return (
        <ChevronUpIcon className="ml-1 inline size-3.5 text-gray-700 dark:text-gray-300" />
      );
    }
    return (
      <ChevronDownIcon className="ml-1 inline size-3.5 text-gray-700 dark:text-gray-300" />
    );
  };

  const pageHref = (p: number) =>
    buildUrl(pathname, getParams(), { page: String(p) });

  const visiblePages = buildVisiblePages(result.page, result.totalPages);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <FileTypeFilterDropdown
          selected={selectedFileTypes}
          onChange={handleFileTypeChange}
        />
        <EmbeddingStatusFilterDropdown
          selected={selectedStatuses}
          onChange={handleStatusChange}
        />
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-sm text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {t('reset-filters')}
          </button>
        )}
      </div>

      <UserFilesTable
        files={result.items}
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
      />

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
