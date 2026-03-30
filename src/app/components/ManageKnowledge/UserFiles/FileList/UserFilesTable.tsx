import { useState, useMemo, type ComponentProps } from 'react';
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
} from '@/features/documents/contracts/document.types';
import { ToolbarActions } from './ToolbarActions';
import { FolderIcon } from '@heroicons/react/24/outline';

type Props = {
  files: UserFileType[];
  subfolders?: DocumentFolderItem[];
  onNavigateFolder?: (folderId: number) => void;
  showModal: ModalStateProps;
  deleteLoading: boolean;
  toggleModal: (filePublicId: UserFile['publicId'] | null) => void;
  onAddFile: (newFile: UserFileType) => void;
  onRemoveFile: (filePublicId: UserFile['publicId']) => void;
  handleDelete: (
    filePublicId: UserFile['publicId'],
    fileName: UserFile['fileName'],
  ) => void;
};

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
  handleDelete: (filePublicId: UserFile['publicId'], fileName: string) => void;
  toggleModal: (filePublicId: UserFile['publicId'] | null) => void;
  onRemoveFile: (filePublicId: UserFile['publicId']) => void;
};

export type ModalStateProps = {
  isOpen: boolean;
  filePublicId: UserFile['publicId'] | null;
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
}: FileRowProps) => {
  const [isLoading] = useState(false);

  const {
    createdAt,
    updatedAt,
    fileName,
    fileSize,
    publicId,
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
        isOpen={showModal.isOpen && showModal.filePublicId === file.publicId}
        onClose={() => toggleModal(null)}
        onConfirm={handleDelete}
        filePublicId={file.publicId}
        fileName={file.fileName}
        isLoading={deleteLoading}
      />
      <TableRow className="text-sm">
        <TableCell className={file.document?.publicId ? 'z-10' : ''}>
          <span className="flex items-center">
            <span className="mr-1 inline-flex size-6 shrink-0 items-center">
              {fileIcon}
            </span>
            {file.document?.publicId ? (
              <Link
                href={`/document/${file.document.publicId}`}
                title={fileName}
                className="cursor-pointer"
              >
                {truncatedFileName}
              </Link>
            ) : (
              <span title={fileName}>{truncatedFileName}</span>
            )}
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
        <TableCell className="text-right w-12">
          <ToolbarActions
            filePublicId={publicId!}
            documentPublicId={file.document?.publicId}
            fileName={fileName}
            toggleModal={toggleModal}
            isLoading={isLoading}
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
}: Props & ComponentProps<'table'>) => {
  const t = useTranslations('files-table');
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

  return (
    <div className="relative">
      <Table className="overflow-x-auto [&_tbody_tr:last-child_td]:border-b-0">
        <TableHead>
          <TableRow className="text-base">
            <TableHeader>{t('file-name')}</TableHeader>
            <TableHeader>{t('file-size')}</TableHeader>
            <TableHeader>{t('created')}</TableHeader>
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
                  {folder.fileCount} {folder.fileCount === 1 ? 'file' : 'files'}
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
              key={file.publicId}
              file={file}
              showModal={showModal}
              toggleModal={toggleModal}
              handleDelete={handleDelete}
              onRemoveFile={onRemoveFile}
            />
          ))}

          {!hasContent && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-sm text-gray-500"
              >
                {t('no-files')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};
