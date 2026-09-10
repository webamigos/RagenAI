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
import { cn } from '@/lib/utils';
import { formatDates } from '@/app/lib/utils/formatDate';
import { DeleteFileModal } from '../DeleteFileModal';
import { getFileIcon } from '@/app/lib/constants/fileIcons';
import { getFileLabel } from '@ragenai/common-ui/utils/file-helpers';

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

/**
 * The knowledge base table is a fixed grid, not the shared `<Table>`.
 *
 * Design system v2 phase 7 gives every column an exact width and the row an
 * exact height, and puts a `min-width` on the grid so the name column never
 * collapses — the table scrolls instead of squeezing. The shared primitive
 * bakes in its own padding, a `text-sm/6` line box and an auto layout, so
 * meeting the spec through it would mean overriding most of what it does.
 *
 * It keeps real table semantics: this is tabular data with a sortable header,
 * and `aria-sort` on a `<th>` is understood in a way a grid of divs is not.
 * Members and audit stay on the shared primitive until their own phase.
 */
const COLUMN = {
  select: 'w-7',
  name: 'w-auto',
  size: 'w-[76px]',
  added: 'w-[128px]',
  status: 'w-[108px]',
  policy: 'w-[168px]',
  actions: 'w-8',
} as const;

/** 30px, 11px uppercase display, per the phase 7 header rule. */
function Th({ className, ...props }: React.ComponentPropsWithoutRef<'th'>) {
  return (
    <th
      {...props}
      className={cn(
        'h-[30px] border-b border-paper-200 px-3 text-left align-middle font-display text-[11px] font-medium uppercase tracking-wide text-muted-foreground dark:border-paper-800',
        className,
      )}
    />
  );
}

/**
 * 34px, and ruled in `paper-100` rather than `--border`. The grid reads
 * without ruling every cell, so the rule is quieter than a border token.
 */
function Td({ className, ...props }: React.ComponentPropsWithoutRef<'td'>) {
  return (
    <td
      {...props}
      className={cn(
        'h-[34px] border-b border-paper-100 px-3 align-middle dark:border-paper-800/60',
        className,
      )}
    />
  );
}

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
      <tr
        className={`group text-sm cursor-pointer hover:bg-muted dark:hover:bg-muted${isSelected ? ' bg-accent/20' : ''}`}
        data-testid={`file-row-${file.id}`}
        onClick={() => onPreviewFile?.(file)}
      >
        {onToggleFile && (
          <Td className="pr-0">
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
          </Td>
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
        <Td>
          <span className="flex min-w-0 items-center gap-2">
            <span className="inline-flex size-5 shrink-0 items-center">
              {fileIcon}
            </span>
            {/*
              The extension as a tag, so the type is readable at a glance and
              the name does not have to be squinted at for its last four
              characters. `getFileLabel` reads the extension the file actually
              has rather than the `fileType` enum, which buckets several
              extensions into one value.
            */}
            <span className="shrink-0 rounded border border-paper-200 px-1 font-mono text-[9px] leading-4 text-muted-foreground dark:border-paper-800">
              {getFileLabel(fileName)}
            </span>
            {/*
              The name is the keyboard's way in.

              The row opens the preview on click, and a `<tr>` cannot take
              focus or answer Enter, so until now the preview was reachable
              by mouse only. Making the row itself focusable is the wrong
              repair: it holds a checkbox, a policy select and a menu, and a
              button wrapped around other controls is a worse thing to land
              on than an unreachable row.

              So the name carries it. One destination, the same one the row
              has — this is not the second target the panel rules forbid,
              which was a *different* destination hidden inside the row.

              Truncated by the column rather than by a character count: a
              hard cut at 40 characters clipped names that fit and kept names
              that did not, and only CSS knows the width.
            */}
            {onPreviewFile ? (
              <button
                type="button"
                onClick={(e) => {
                  // The row handles the click as well; without this the
                  // preview would be asked for twice.
                  e.stopPropagation();
                  onPreviewFile(file);
                }}
                title={fileName}
                className="min-w-0 truncate rounded text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {fileName}
              </button>
            ) : (
              /* Nothing to open, so nothing to focus. A control that does
                 nothing is worse in a tab order than no control. */
              <span className="min-w-0 truncate" title={fileName}>
                {fileName}
              </span>
            )}
            <SuspiciousContentBadge metadata={file.metadata} />
            <RagScoreBadge metadata={file.metadata} />
          </span>
        </Td>
        <Td className="text-right tabular-nums text-muted-foreground">
          {prettyBytes(fileSize)}
        </Td>
        <Td className="text-right tabular-nums text-muted-foreground">
          {formattedCreatedAt}
        </Td>
        <Td>
          <FileStatusBadge
            embeddingStatus={file.embeddingStatus}
            parsingStatus={file.parsingStatus}
          />
        </Td>
        {canManageOrg === true && (
          <Td onClick={(e) => e.stopPropagation()}>
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
          </Td>
        )}
        <Td className="text-right" onClick={(e) => e.stopPropagation()}>
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
        </Td>
      </tr>
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
    /*
      The grid has a floor and the wrapper scrolls, rather than the columns
      squeezing. Below 840px the name column would otherwise be the one that
      gives, and a file name that has to be guessed at is the one thing this
      table exists to show.
    */
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[840px] table-fixed border-collapse text-sm [&_tbody_tr:last-child_td]:border-b-0">
        <colgroup>
          {showCheckboxes && <col className={COLUMN.select} />}
          <col className={COLUMN.name} />
          <col className={COLUMN.size} />
          <col className={COLUMN.added} />
          <col className={COLUMN.status} />
          {canManageOrg === true && <col className={COLUMN.policy} />}
          <col className={COLUMN.actions} />
        </colgroup>
        <thead>
          <tr>
            {showCheckboxes && (
              <Th className="pr-0">
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
              </Th>
            )}
            <Th
              className={cn(
                sort === 'fileName' && 'text-brand-700 dark:text-brand-300',
              )}
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
            </Th>
            <Th
              className={cn(
                'text-right',
                sort === 'fileSize' && 'text-brand-700 dark:text-brand-300',
              )}
              aria-sort={ariaSortFor('fileSize')}
              data-testid="sort-header-fileSize"
            >
              <button
                type="button"
                className={cn(
                  'ml-auto flex items-center gap-1',
                  onSort && 'cursor-pointer select-none',
                )}
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
            </Th>
            <Th
              className={cn(
                'text-right',
                sort === 'createdAt' && 'text-brand-700 dark:text-brand-300',
              )}
              aria-sort={ariaSortFor('createdAt')}
              data-testid="sort-header-createdAt"
            >
              <button
                type="button"
                className={cn(
                  'ml-auto flex items-center gap-1',
                  onSort && 'cursor-pointer select-none',
                )}
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
            </Th>
            <Th>{t('processed')}</Th>
            {canManageOrg === true && (
              <Th data-testid="pii-policy-column-header">
                {tPiiPolicy('label')}
              </Th>
            )}
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {/* Folder rows */}
          {subfolders.map((folder) => (
            <tr
              key={`folder-${folder.id}`}
              className="text-sm cursor-pointer hover:bg-muted"
              onClick={() => onNavigateFolder?.(folder.id)}
            >
              {showCheckboxes && <Td className="pr-0" />}
              <Td>
                <span className="flex items-center gap-2">
                  <FolderIcon className="size-5 text-muted-foreground shrink-0" />
                  <span className="font-medium">{folder.name}</span>
                  {folder.teamName && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-primary dark:bg-primary/15">
                      {folder.teamName}
                    </span>
                  )}
                </span>
              </Td>
              <Td>
                <span className="text-xs text-muted-foreground">
                  {tFolders('file-count', { count: folder.fileCount })}
                </span>
              </Td>
              <Td />
              <Td />
              {canManageOrg === true && <Td />}
              <Td />
            </tr>
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
        </tbody>
      </table>
    </div>
  );
};
