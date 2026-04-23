import React, { useState, useMemo, type ComponentProps } from 'react';
import prettyBytes from 'pretty-bytes';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { DEFAULT_PROJECT_TITLE } from '@/features/organizations/constants/settings';

import {
  EmbeddingStatus,
  ParsingStatus,
  type FileType,
  type UserFile,
} from '@/generated/prisma/browser';
import { Text } from '@ragenai/common-ui/Text';
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
import { FolderIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { SuspiciousContentBadge } from './SuspiciousContentBadge';
import { RagScoreBadge } from './RagScoreBadge';
import { Tooltip } from '@ragenai/common-ui/Tooltip';
import { EmptyState } from '@ragenai/tui/empty-state';
import { scoreDocumentAction } from '@/app/[locale]/(panel)/knowledge/optimize-document/actions';
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
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        {t('status-ready')}
      </span>
    );
  }

  if (
    embeddingStatus === EmbeddingStatus.FAILED ||
    parsingStatus === ParsingStatus.FAILED
  ) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
        {t('status-failed')}
      </span>
    );
  }

  if (
    embeddingStatus === EmbeddingStatus.STARTED ||
    parsingStatus === ParsingStatus.STARTED
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        <span className="size-1.5 animate-pulse rounded-full bg-yellow-500" />
        {t('status-processing')}
      </span>
    );
  }

  // NOT_STARTED — file just uploaded, waiting for worker
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
      <span className="size-1.5 animate-pulse rounded-full bg-yellow-500" />
      {t('status-processing')}
    </span>
  );
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
}: FileRowProps) => {
  const [isLoading] = useState(false);
  const [isScoringLoading, setIsScoringLoading] = useState(false);
  const tBulkBar = useTranslations('bulk-action-bar');
  const { infoToast, errorToast } = statusToast();
  const router = useRouter();

  const tOptimizer = useTranslations('document-optimizer');

  const handleScore = async (fId: string) => {
    setIsScoringLoading(true);
    try {
      const score = await scoreDocumentAction(fId);
      infoToast({
        message: tOptimizer('score-success', {
          score: Math.round(score.total),
        }),
      });
      router.refresh();
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

  const {
    createdAt: formattedCreatedAt,
    embeddingCompletedAt: formattedEmbeddingCompletedAt,
  } = useMemo(
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
        className={`group text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/60${isSelected ? ' bg-blue-50 dark:bg-blue-950/20' : ''}`}
        data-testid={`file-row-${file.id}`}
        onClick={() => onPreviewFile?.(file)}
      >
        {onToggleFile && (
          <TableCell className="w-8 pr-0">
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={() => onToggleFile(file.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={tBulkBar('select-file', { fileName: file.fileName })}
              data-testid={`file-checkbox-${file.id}`}
              className="size-4 cursor-pointer rounded border-gray-300 accent-blue-600"
            />
          </TableCell>
        )}
        <TableCell className={file.document?.id ? 'z-10' : ''}>
          <span className="flex items-center">
            <span className="mr-1 inline-flex size-6 shrink-0 items-center">
              {fileIcon}
            </span>
            {file.document?.id ? (
              <Link
                href={`/document/${file.document.id}`}
                title={fileName}
                className="text-indigo-600 hover:underline dark:text-indigo-400"
                onClick={(e) => e.stopPropagation()}
              >
                {truncatedFileName}
              </Link>
            ) : (
              <span title={fileName}>{truncatedFileName}</span>
            )}
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
}: Props & ComponentProps<'table'>) => {
  const t = useTranslations('files-table');
  const tBulkBar = useTranslations('bulk-action-bar');
  const tFolders = useTranslations('folders');
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
        icon={
          <ArrowUpTrayIcon className="size-10 text-gray-300 dark:text-gray-600" />
        }
        title={tFolders('no-documents')}
        description={tFolders('drag-drop')}
        actions={actions}
        className="py-20"
      />
    );
  }

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
                    className="size-4 cursor-pointer rounded border-gray-300 accent-blue-600"
                  />
                </Tooltip>
              </TableHeader>
            )}
            <TableHeader
              className={onSort ? 'cursor-pointer select-none' : ''}
              onClick={() => onSort?.('fileName')}
              data-testid="sort-header-fileName"
            >
              {t('sort-file-name')}
              {SortIcon && (
                <span data-testid="sort-icon-fileName">
                  <SortIcon column="fileName" />
                </span>
              )}
            </TableHeader>
            <TableHeader
              className={onSort ? 'cursor-pointer select-none' : ''}
              onClick={() => onSort?.('fileSize')}
              data-testid="sort-header-fileSize"
            >
              {t('sort-file-size')}
              {SortIcon && (
                <span data-testid="sort-icon-fileSize">
                  <SortIcon column="fileSize" />
                </span>
              )}
            </TableHeader>
            <TableHeader
              className={onSort ? 'cursor-pointer select-none' : ''}
              onClick={() => onSort?.('createdAt')}
              data-testid="sort-header-createdAt"
            >
              {t('sort-created')}
              {SortIcon && (
                <span data-testid="sort-icon-createdAt">
                  <SortIcon column="createdAt" />
                </span>
              )}
            </TableHeader>
            <TableHeader>{t('processed')}</TableHeader>
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
              className="text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
              onClick={() => onNavigateFolder?.(folder.id)}
            >
              {showCheckboxes && <TableCell className="w-8 pr-0" />}
              <TableCell>
                <span className="flex items-center gap-2">
                  <FolderIcon className="size-5 text-gray-400 shrink-0" />
                  <span className="font-medium">{folder.name}</span>
                  {folder.teamName && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      {folder.teamName}
                    </span>
                  )}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-gray-400">
                  {tFolders('file-count', { count: folder.fileCount })}
                </span>
              </TableCell>
              <TableCell />
              <TableCell />
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
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
