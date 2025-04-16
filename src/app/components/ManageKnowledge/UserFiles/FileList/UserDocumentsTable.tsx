import { useState, useMemo, type ComponentProps } from 'react';
import prettyBytes from 'pretty-bytes';
import { useTranslations } from 'next-intl';

import { FileType, UserFile } from '@prisma/client';
import * as CommonUi from '@ragenai/common-ui';
import { formatDates } from '@/app/lib/utils/formatDate';
import { truncateFileName } from '../../../../lib/utils/truncateFileName';
import { DeleteFileModal } from '../DeleteFileModal';
import { getFileIcon } from '@/app/lib/constants/fileIcons';

import { type UserFileType } from '@/app/contracts/Documents';
import { ToolbarActions } from './ToolbarActions';

type Props = {
  files: UserFileType[];
  showModal: ModalStateProps;
  deleteLoading: boolean;
  toggleModal: (filePublicId: string | null) => void;
  onAddFile: (newFile: UserFileType) => void;
  onRemoveFile: (filePublicId: UserFile['public_id']) => void;
  handleDelete: (
    filePublicId: UserFile['public_id'],
    fileName: UserFile['file_name']
  ) => void;
};

export type UserFileTypeSafe = UserFileType & { file_type: FileType };

type DocumentRowProps = {
  document: UserFileTypeSafe;
  showModal: ModalStateProps;
  deleteLoading: boolean;
  handleDelete: (filePublicId: UserFile['public_id'], fileName: string) => void;
  toggleModal: (filePublicId: UserFile['public_id'] | null) => void;
  onRemoveFile: (filePublicId: UserFile['public_id']) => void;
};

export type ModalStateProps = {
  isOpen: boolean;
  filePublicId: string | null;
};

const DocumentRow = ({
  document,
  showModal,
  deleteLoading,
  toggleModal,
  handleDelete,
}: DocumentRowProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const { created_at, updated_at, file_name, file_size, public_id } = document;

  const fileIcon = getFileIcon(document.file_type);

  const { created_at: formattedCreatedAt, updated_at: formattedUpdatedAt } =
    useMemo(
      () => formatDates({ created_at, updated_at }),
      [created_at, updated_at]
    );

  const truncatedFileName = useMemo(
    () => truncateFileName(file_name, 40),
    [file_name]
  );

  return (
    <>
      {/* this is UserFile not UserDocument ! */}
      {showModal.isOpen && showModal.filePublicId === document.public_id && (
        <DeleteFileModal
          toggleModal={toggleModal}
          handleDelete={handleDelete}
          filePublicId={document.public_id}
          fileName={document.file_name}
          isLoading={deleteLoading}
        />
      )}
      <CommonUi.TableRow className="relative text-sm overflow-x-hidden">
        <CommonUi.TableCell className="flex">
          <span className="w-6 h-6 -mb-2 mr-1">{fileIcon}</span>
          <CommonUi.Tooltip
            delayShow={1000}
            place="top"
            content={file_name}
            id={`tooltip-${public_id}`}
          >
            <CommonUi.Text className="hidden lg:flex">
              {truncatedFileName}
            </CommonUi.Text>
          </CommonUi.Tooltip>
          <CommonUi.Text className="lg:hidden">
            {truncatedFileName}
          </CommonUi.Text>
        </CommonUi.TableCell>
        <CommonUi.TableCell>{prettyBytes(file_size)}</CommonUi.TableCell>
        <CommonUi.TableCell>{formattedCreatedAt}</CommonUi.TableCell>
        <CommonUi.TableCell>{formattedUpdatedAt}</CommonUi.TableCell>
        <CommonUi.TableCell className="relative -mx-3 mr-10 -my-1.5 sm:-mx-2.5">
          <ToolbarActions
            filePublicId={public_id!}
            documentPublicId={document.document?.public_id}
            fileName={file_name}
            toggleModal={toggleModal}
            isLoading={isLoading}
          />
        </CommonUi.TableCell>
      </CommonUi.TableRow>
    </>
  );
};

export const UserDocumentsTable = ({
  files,
  showModal,
  deleteLoading,
  toggleModal,
  handleDelete,
  onRemoveFile,
}: Props & ComponentProps<'table'>) => {
  const t = useTranslations('files-table');
  const [searchValue, setSearchValue] = useState('');

  const filteredDocuments = useMemo(() => {
    if (!searchValue) {
      return files as UserFileTypeSafe[];
    }

    return files.filter(
      (file) =>
        file.file_name.toLowerCase().includes(searchValue.toLowerCase()) &&
        file.project?.title === 'Default'
    ) as UserFileTypeSafe[];
  }, [files, searchValue]);

  return (
    <div className="relative mt-6">
      <CommonUi.Table className="overflow-x-auto">
        <CommonUi.TableHead>
          <CommonUi.TableRow className="text-base">
            <CommonUi.TableHeader>{t('file-name')}</CommonUi.TableHeader>
            <CommonUi.TableHeader>{t('file-size')}</CommonUi.TableHeader>
            <CommonUi.TableHeader>{t('created')}</CommonUi.TableHeader>
            <CommonUi.TableHeader>{t('updated')}</CommonUi.TableHeader>
            <CommonUi.TableHeader>
              <span className="sr-only">Actions</span>
            </CommonUi.TableHeader>
          </CommonUi.TableRow>
        </CommonUi.TableHead>
        <CommonUi.TableBody>
          {filteredDocuments.length > 0 ? (
            filteredDocuments.map((file) => (
              <DocumentRow
                deleteLoading={deleteLoading}
                key={file.public_id}
                document={file}
                showModal={showModal}
                toggleModal={toggleModal}
                handleDelete={handleDelete}
                onRemoveFile={onRemoveFile}
              />
            ))
          ) : (
            <CommonUi.TableRow>
              <CommonUi.TableCell
                colSpan={5}
                className="text-center text-sm text-gray-500"
              >
                {t('no-files')}
              </CommonUi.TableCell>
            </CommonUi.TableRow>
          )}
        </CommonUi.TableBody>
      </CommonUi.Table>
    </div>
  );
};
