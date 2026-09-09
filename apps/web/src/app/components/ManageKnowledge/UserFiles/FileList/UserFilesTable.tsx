import React, { useState, useRef, useMemo, type ComponentProps } from 'react';
import prettyBytes from 'pretty-bytes';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/ui/status-badge';
import { DEFAULT_PROJECT_TITLE } from '@/features/organizations/constants/settings';

import {
  EmbeddingStatus,
  ParsingStatus,
  type FileType,
  type UserFile,
} from '@/generated/prisma/browser';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeader,
} from '@ragenai/common-ui/Table';
import { formatDates } from '@/app/lib/utils/formatDate';
import { truncateFileName } from '../../../../lib/utils/truncateFileName';
import { DeleteFileModal } from '../DeleteFileModal';
import { getFileIcon } from '@/app/lib/constants/fileIcons';

import {
  type UserFileType,
  type DocumentFolderItem,
  type UserFilesSort,
  type UserFilesSortDir,
} from '@/features/documents/contracts/document.types';
import { ToolbarActions } from './ToolbarActions';
import {
  FolderIcon,
  ArrowUpTrayIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { SuspiciousContentBadge } from './SuspiciousContentBadge';
import { RagScoreBadge } from './RagScoreBadge';
import { PiiPolicySelect, type PiiPolicyValue } from '../../PiiPolicySelect';
import { Tooltip } from '@ragenai/common-ui/Tooltip';
import { EmptyState } from '@ragenai/common-ui/EmptyState';
import { scoreDocumentAction } from '@/app/[locale]/(panel)/knowledge/optimize-document/actions';
import { updateFilePiiPolicy, reembedFile } from '@/app/actions';
import { statusToast } from '@/app/lib/utils/toast';
import { useRouter } from '@/i18n/routing';

type SelectionProps = {
  isSelected?: (id: string) => boolean;
  isAllSelected?: (ids: string[]) => boolean;
  isIndeterminate?: (ids: string[]) => boolean;
  onToggleFile?: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
};

type Props = {
  files: UserFileType[];
  subfolders?: DocumentFolderItem[];
  onNavigateFolder?: (folderId: string) => void;
  showModal: ModalStateProps;
  deleteLoading: boolean;
  toggleModal: (fileId: UserFile['id'] | null) => void;
  onAddFile: (newFile: UserFileType) => void;
  onRemoveFile: (fileId: UserFile['id']) => void;
  handleDelete: (
    fileId: UserFile['id'],
    fileName: UserFile['fileName'],
  ) => void;
  onUpload?: () => void;
  onCreateDocument?: () => void;
  onAddFromUrl?: () => void;
  onPreviewFile?: (file: UserFileTypeSafe) => void;
  sort?: UserFilesSort;
  dir?: UserFilesSortDir;
  onSort?: (column: UserFilesSort) => void;
  SortIcon?: React.ComponentType<{ column: UserFilesSort }>;
  isFilteredEmpty?: boolean;
  onResetFilters?: () => void;
  canManageOrg?: boolean;
} & SelectionProps;

export type UserFileTypeSafe = UserFileType & {
  fileType: FileType;
  embeddingStatus: EmbeddingStatus;
  embeddingStartedAt: UserFile['embeddingStartedAt'];
  embeddingCompletedAt: UserFile['embeddingCompletedAt'];
  embeddingFailedAt: UserFile['embeddingFailedAt'];
};

type FileRowProps = {
  file: UserFileTypeSafe;
  showModal: ModalStateProps;
  deleteLoading: boolean;
  handleDelete: (fileId: UserFile['id'], fileName: string) => void;
  toggleModal: (fileId: UserFile['id'] | null) => void;
  onRemoveFile: (fileId: UserFile['id']) => void;
  isSelected?: boolean;
  onToggleFile?: (id: string) => void;
  onPreviewFile?: (file: UserFileTypeSafe) => void;
  canManageOrg?: boolean;
};

export type ModalStateProps = {
  isOpen: boolean;
  fileId: UserFile['id'] | null;
};

function FileStatusBadge({
  embeddingStatus,
  parsingStatus,
}: {
  embeddingStatus?: EmbeddingStatus;
  parsingStatus?: ParsingStatus;
}) {
  const t = useTranslations('files-table');

  if (embeddingStatus === EmbeddingStatus.COMPLETED) {
    return <StatusBadge state="ready" label={t('status-ready')} />;
  }

  if (
    embeddingStatus === EmbeddingStatus.FAILED ||
    parsingStatus === ParsingStatus.FAILED
  ) {
    return <StatusBadge state="failed" label={t('status-failed')} />;
  }

  if (
    embeddingStatus === EmbeddingStatus.STARTED ||
    parsingStatus === ParsingStatus.STARTED
  ) {
    return <StatusBadge state="processing" label={t('status-processing')} />;
  }

  // NOT_STARTED — uploaded, waiting for a worker to pick it up. This used to
  // render as `processing` with a pulsing dot, which said work was underway
  // when none had started; `queued` is the state the design has for it.
  return <StatusBadge state="queued" label={t('status-queued')} />;
}

const FileRow = ({
  file,
  showModal,
  deleteLoading,
  toggleModal,
  handleDelete,
  isSelected,
  onToggleFile,
  onPreviewFile,
  canManageOrg,
}: FileRowProps) => {
  const [isLoading] = useState(false);
  const [isScoringLoading, setIsScoringLoading] = useState(false);
  const [isPiiUpdating, setIsPiiUpdating] = useState(false);
  const savedPiiPolicy = useRef<PiiPolicyValue>(
    (file.piiPolicy as PiiPolicyValue) ?? 'TOXIC_ONLY',
  );
  const [currentPiiPolicy, setCurrentPiiPolicy] = useState<PiiPolicyValue>(
    (file.piiPolicy as PiiPolicyValue) ?? 'TOXIC_ONLY',
  );
  const [isReembedding, setIsReembedding] = useState(false);
  const tBulkBar = useTranslations('bulk-action-bar');
  const tPii = useTranslations('pii-policy');
  const tTable = useTranslations('files-table');
  const { infoToast, errorToast } = statusToast();
  const router = useRouter();

  const tOptimizer = useTranslations('document-optimizer');

  const handleScore = async (fId: string) => {
    setIsScoringLoading(true);
    try {
      await scoreDocumentAction(fId);
      infoToast({ message: tOptimizer('score-started') });
    } catch {
      errorToast({ message: tOptimizer('score-error') });
    } finally {
      setIsScoringLoading(false);
    }
  };

  const {
    createdAt,
    updatedAt,
    fileName,
    fileSize,
    id: fileIdVal,
    embeddingStatus,
    embeddingCompletedAt,
  } = file;

  const fileIcon = getFileIcon(file.fileType);

  const { createdAt: formattedCreatedAt } = useMemo(
    () => formatDates({ createdAt, updatedAt, embeddingCompletedAt }),
    [createdAt, updatedAt, embeddingCompletedAt],
  );

  const truncatedFileName = useMemo(
    () => truncateFileName(fileName, 40),
    [fileName],
  );

  return (
    <>
      <DeleteFileModal
        isOpen={showModal.isOpen && showModal.fileId === file.id}
        onClose={() => toggleModal(null)}
        onConfirm={handleDelete}
        fileId={file.id}
        fileName={file.fileName}
        isLoading={deleteLoading}
      />
      <TableRow
        className={`group text-sm cursor-pointer hover:bg-muted dark:hover:bg-muted${isSelected ? ' bg-accent/20' : ''}`}
        data-testid={`file-row-${file.id}`}
        onClick={() => onPreviewFile?.(file)}
      >
        {onToggleFile && (
          <TableCell className="w-8 pr-0">
            <span className="flex h-full items-center">
              <input
                type="checkbox"
                checked={!!isSelected}
                onChange={() => onToggleFile(file.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={tBulkBar('select-file', {
                  fileName: file.fileName,
                })}
                data-testid={`file-checkbox-${file.id}`}
                className="size-4 cursor-pointer rounded border-border accent-primary"
              />
            </span>
          </TableCell>
        )}
        {/*
          The name is text, not a link.

          The row already has a click target — it opens the preview drawer —
          and the name used to be a second one going somewhere else entirely,
          the extracted-content page. Two destinations in one row, one of them
          hidden inside the other, and which you got depended on hitting a few
          characters of filename. It also only appeared on files that had
          finished parsing, so the same column was a link or not depending on
          state nobody was reading it for.

          Reaching the extracted content is a deliberate act now: Actions →
          View, in the row's own menu, which already offered exactly that.
        */}
        <TableCell>
          <span className="flex items-center">
            <span className="mr-1 inline-flex size-6 shrink-0 items-center">
              {fileIcon}
            </span>
            <span title={fileName}>{truncatedFileName}</span>
            <SuspiciousContentBadge metadata={file.metadata} />
            <RagScoreBadge metadata={file.metadata} />
          </span>
        </TableCell>
        <TableCell>{prettyBytes(fileSize)}</TableCell>
        <TableCell>{formattedCreatedAt}</TableCell>
        <TableCell>
          <FileStatusBadge
            embeddingStatus={file.embeddingStatus}
            parsingStatus={file.parsingStatus}
          />
        </TableCell>
        {canManageOrg === true && (
          <TableCell onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <PiiPolicySelect
                value={currentPiiPolicy}
                disabled={isPiiUpdating || isReembedding}
                compact
                onChange={async (policy) => {
                  setIsPiiUpdating(true);
                  try {
                    await updateFilePiiPolicy(file.id, policy as any);
                    setCurrentPiiPolicy(policy);
                  } catch {
                    errorToast({ message: 'Failed to update PII policy' });
                  } finally {
                    setIsPiiUpdating(false);
                  }
                }}
              />
              {currentPiiPolicy !== savedPiiPolicy.current && (
                <Tooltip
                  id={`pii-reembed-tooltip-${file.id}`}
                  content={tPii('inline-edit-tooltip')}
                  place="top"
                >
                  <button
                    type="button"
                    disabled={isReembedding}
                    onClick={async () => {
                      setIsReembedding(true);
                      try {
                        await reembedFile(file.id);
                        infoToast({ message: tPii('reembed-success') });
                        savedPiiPolicy.current = currentPiiPolicy;
                        router.refresh();
                      } catch {
                        errorToast({ message: tPii('reembed-error') });
                      } finally {
                        setIsReembedding(false);
                      }
                    }}
                    className="shrink-0 rounded px-2 py-1 text-xs font-medium bg-brand-600 text-primary-foreground hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {isReembedding ? '…' : tTable('reembed')}
                  </button>
                </Tooltip>
              )}
            </div>
          </TableCell>
        )}
        <TableCell
          className="text-right w-12"
          onClick={(e) => e.stopPropagation()}
        >
          <ToolbarActions
            fileId={fileIdVal!}
            documentId={file.document?.id}
            fileName={fileName}
            toggleModal={toggleModal}
            isLoading={isLoading}
            onScore={
              embeddingStatus === EmbeddingStatus.COMPLETED
                ? handleScore
                : undefined
            }
            isScoringLoading={isScoringLoading}
          />
        </TableCell>
      </TableRow>
    </>
  );
};

export const UserFilesTable = ({
  files,
  subfolders = [],
  onNavigateFolder,
  showModal,
  deleteLoading,
  toggleModal,
  handleDelete,
  onRemoveFile,
  isSelected,
  isAllSelected,
  isIndeterminate,
  onToggleFile,
  onToggleAll,
  onUpload,
  onCreateDocument,
  onAddFromUrl,
  onPreviewFile,
  sort,
  dir,
  onSort,
  SortIcon,
  isFilteredEmpty = false,
  onResetFilters,
  canManageOrg,
}: Props & ComponentProps<'table'>) => {
  const t = useTranslations('files-table');
  const tBulkBar = useTranslations('bulk-action-bar');
  const tFolders = useTranslations('folders');
  const tPiiPolicy = useTranslations('pii-policy');
  const [searchValue] = useState('');

  const filteredDocuments = useMemo(() => {
    if (!searchValue) {
      return files as UserFileTypeSafe[];
    }

    return files.filter(
      (file) =>
        file.fileName.toLowerCase().includes(searchValue.toLowerCase()) &&
        (file.project?.title === 'Default' ||
          file.project?.title === DEFAULT_PROJECT_TITLE),
    ) as UserFileTypeSafe[];
  }, [files, searchValue]);

  const hasContent = subfolders.length > 0 || filteredDocuments.length > 0;
  const fileIds = useMemo(
    () => filteredDocuments.map((f) => f.id),
    [filteredDocuments],
  );
  const showCheckboxes = !!onToggleFile;

  if (!hasContent) {
    if (isFilteredEmpty) {
      return (
        <EmptyState
          icon={<FunnelIcon className="size-10 text-muted-foreground" />}
          title={t('no-results-for-filters')}
          actions={
            onResetFilters
              ? [{ label: t('reset-filters'), onClick: onResetFilters }]
              : undefined
          }
          className="py-20"
        />
      );
    }
    const actions = onUpload
      ? [
          { label: tFolders('upload-cta'), onClick: onUpload },
          ...(onCreateDocument
            ? [
                {
                  label: tFolders('create-document'),
                  onClick: onCreateDocument,
                },
              ]
            : []),
          ...(onAddFromUrl
            ? [{ label: tFolders('add-from-url'), onClick: onAddFromUrl }]
            : []),
        ]
      : undefined;
    return (
      <EmptyState
        icon={<ArrowUpTrayIcon className="size-10 text-muted-foreground" />}
        title={tFolders('no-documents')}
        description={tFolders('drag-drop')}
        actions={actions}
        className="py-20"
      />
    );
  }

  const ariaSortFor = (col: string): 'ascending' | 'descending' | 'none' => {
    if (sort !== col) {
      return 'none';
    }
    return dir === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <div className="relative overflow-x-auto">
      <Table className="[&_tbody_tr:last-child_td]:border-b-0">
        <TableHead>
          <TableRow className="text-base">
            {showCheckboxes && (
              <TableHeader className="w-8 pr-0">
                <Tooltip
                  content={tBulkBar('select-all')}
                  id="select-all-tooltip"
                  place="right"
                  delayShow={500}
                >
                  <input
                    type="checkbox"
                    checked={isAllSelected ? isAllSelected(fileIds) : false}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = isIndeterminate
                          ? isIndeterminate(fileIds)
                          : false;
                      }
                    }}
                    onChange={() => onToggleAll?.(fileIds)}
                    aria-label={tBulkBar('select-all')}
                    data-testid="select-all-checkbox"
                    className="size-4 cursor-pointer rounded border-border accent-primary"
                  />
                </Tooltip>
              </TableHeader>
            )}
            <TableHeader
              className={
                sort === 'fileName' ? 'text-brand-700 dark:text-brand-300' : ''
              }
              aria-sort={ariaSortFor('fileName')}
              data-testid="sort-header-fileName"
            >
              <button
                type="button"
                className={`flex items-center gap-1 ${onSort ? 'cursor-pointer select-none' : ''}`}
                onClick={() => onSort?.('fileName')}
                disabled={!onSort}
              >
                {t('sort-file-name')}
                {SortIcon && (
                  <span data-testid="sort-icon-fileName">
                    <SortIcon column="fileName" />
                  </span>
                )}
              </button>
            </TableHeader>
            <TableHeader
              className={
                sort === 'fileSize' ? 'text-brand-700 dark:text-brand-300' : ''
              }
              aria-sort={ariaSortFor('fileSize')}
              data-testid="sort-header-fileSize"
            >
              <button
                type="button"
                className={`flex items-center gap-1 ${onSort ? 'cursor-pointer select-none' : ''}`}
                onClick={() => onSort?.('fileSize')}
                disabled={!onSort}
              >
                {t('sort-file-size')}
                {SortIcon && (
                  <span data-testid="sort-icon-fileSize">
                    <SortIcon column="fileSize" />
                  </span>
                )}
              </button>
            </TableHeader>
            <TableHeader
              className={
                sort === 'createdAt' ? 'text-brand-700 dark:text-brand-300' : ''
              }
              aria-sort={ariaSortFor('createdAt')}
              data-testid="sort-header-createdAt"
            >
              <button
                type="button"
                className={`flex items-center gap-1 ${onSort ? 'cursor-pointer select-none' : ''}`}
                onClick={() => onSort?.('createdAt')}
                disabled={!onSort}
              >
                {t('sort-created')}
                {SortIcon && (
                  <span data-testid="sort-icon-createdAt">
                    <SortIcon column="createdAt" />
                  </span>
                )}
              </button>
            </TableHeader>
            <TableHeader>{t('processed')}</TableHeader>
            {canManageOrg === true && (
              <TableHeader data-testid="pii-policy-column-header">
                {tPiiPolicy('label')}
              </TableHeader>
            )}
            <TableHeader>
              <span className="sr-only">Actions</span>
            </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {/* Folder rows */}
          {subfolders.map((folder) => (
            <TableRow
              key={`folder-${folder.id}`}
              className="text-sm cursor-pointer hover:bg-muted"
              onClick={() => onNavigateFolder?.(folder.id)}
            >
              {showCheckboxes && <TableCell className="w-8 pr-0" />}
              <TableCell>
                <span className="flex items-center gap-2">
                  <FolderIcon className="size-5 text-muted-foreground shrink-0" />
                  <span className="font-medium">{folder.name}</span>
                  {folder.teamName && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-primary dark:bg-primary/15">
                      {folder.teamName}
                    </span>
                  )}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {tFolders('file-count', { count: folder.fileCount })}
                </span>
              </TableCell>
              <TableCell />
              <TableCell />
              {canManageOrg === true && <TableCell />}
              <TableCell />
            </TableRow>
          ))}

          {/* File rows */}
          {filteredDocuments.map((file) => (
            <FileRow
              deleteLoading={deleteLoading}
              key={file.id}
              file={file}
              showModal={showModal}
              toggleModal={toggleModal}
              handleDelete={handleDelete}
              onRemoveFile={onRemoveFile}
              isSelected={isSelected ? isSelected(file.id) : undefined}
              onToggleFile={onToggleFile}
              onPreviewFile={onPreviewFile}
              canManageOrg={canManageOrg}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
