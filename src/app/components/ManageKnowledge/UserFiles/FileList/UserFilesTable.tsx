import { useState, useMemo, type ComponentProps } from 'react';
import prettyBytes from 'pretty-bytes';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

import {
  EmbeddingStatus,
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

import { type UserFileType } from '@/features/documents/contracts/document.types';
import { ToolbarActions } from './ToolbarActions';

type Props = {
  files: UserFileType[];
  showModal: ModalStateProps;
  deleteLoading: boolean;
  toggleModal: (filePublicId: UserFile['public_id'] | null) => void;
  onAddFile: (newFile: UserFileType) => void;
  onRemoveFile: (filePublicId: UserFile['public_id']) => void;
  handleDelete: (
    filePublicId: UserFile['public_id'],
    fileName: UserFile['file_name'],
  ) => void;
};

export type UserFileTypeSafe = UserFileType & {
  file_type: FileType;
  embedding_status: EmbeddingStatus;
  embedding_started_at: UserFile['embedding_started_at'];
  embedding_completed_at: UserFile['embedding_completed_at'];
  embedding_failed_at: UserFile['embedding_failed_at'];
};

type FileRowProps = {
  file: UserFileTypeSafe;
  showModal: ModalStateProps;
  deleteLoading: boolean;
  handleDelete: (filePublicId: UserFile['public_id'], fileName: string) => void;
  toggleModal: (filePublicId: UserFile['public_id'] | null) => void;
  onRemoveFile: (filePublicId: UserFile['public_id']) => void;
};

export type ModalStateProps = {
  isOpen: boolean;
  filePublicId: UserFile['public_id'] | null;
};

const FileRow = ({
  file,
  showModal,
  deleteLoading,
  toggleModal,
  handleDelete,
}: FileRowProps) => {
  const [isLoading] = useState(false);

  const {
    created_at,
    updated_at,
    file_name,
    file_size,
    public_id,
    embedding_status,
    embedding_completed_at,
  } = file;

  const fileIcon = getFileIcon(file.file_type);

  const {
    created_at: formattedCreatedAt,
    embedding_completed_at: formattedEmbeddingCompletedAt,
  } = useMemo(
    () => formatDates({ created_at, updated_at, embedding_completed_at }),
    [created_at, updated_at, embedding_completed_at],
  );

  const truncatedFileName = useMemo(
    () => truncateFileName(file_name, 40),
    [file_name],
  );

  return (
    <>
      {showModal.isOpen && showModal.filePublicId === file.public_id && (
        <DeleteFileModal
          toggleModal={toggleModal}
          handleDelete={handleDelete}
          filePublicId={file.public_id}
          fileName={file.file_name}
          isLoading={deleteLoading}
        />
      )}
      <TableRow className="text-sm">
        <TableCell className={file.document?.public_id ? 'z-10' : ''}>
          <span className="flex items-center">
            <span className="mr-1 inline-flex size-6 shrink-0 items-center">
              {fileIcon}
            </span>
            {file.document?.public_id ? (
              <Link
                href={`/document/${file.document.public_id}`}
                title={file_name}
                className="cursor-pointer"
              >
                {truncatedFileName}
              </Link>
            ) : (
              <span title={file_name}>{truncatedFileName}</span>
            )}
          </span>
        </TableCell>
        <TableCell>{prettyBytes(file_size)}</TableCell>
        <TableCell>{formattedCreatedAt}</TableCell>
        <TableCell>
          {embedding_status === EmbeddingStatus.COMPLETED
            ? formattedEmbeddingCompletedAt
            : '-'}
        </TableCell>
        <TableCell className="text-right">
          <ToolbarActions
            filePublicId={public_id!}
            documentPublicId={file.document?.public_id}
            fileName={file_name}
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
        file.file_name.toLowerCase().includes(searchValue.toLowerCase()) &&
        file.project?.title === 'Default',
    ) as UserFileTypeSafe[];
  }, [files, searchValue]);

  return (
    <div className="relative mt-6">
      <Table className="overflow-x-auto">
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
          {filteredDocuments.length > 0 ? (
            filteredDocuments.map((file) => (
              <FileRow
                deleteLoading={deleteLoading}
                key={file.public_id}
                file={file}
                showModal={showModal}
                toggleModal={toggleModal}
                handleDelete={handleDelete}
                onRemoveFile={onRemoveFile}
              />
            ))
          ) : (
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
