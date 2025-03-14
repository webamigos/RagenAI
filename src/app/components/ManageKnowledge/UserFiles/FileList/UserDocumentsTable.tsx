import { useState, useMemo, type ComponentProps } from 'react';
import prettyBytes from 'pretty-bytes';
import { useTranslations } from 'next-intl';

import * as CommonUi from '@ragenai/common-ui';
import { formatDates } from '@/app/lib/utils/formatDate';
import { truncateFileName } from '../../../../lib/utils/truncateFileName';
import { DeleteFileModal } from '../DeleteFileModal';
import { getFileIcon } from '@/app/lib/constants/fileIcons';

import { type UserFileType } from '@/app/contracts/Documents';
import { type SupportedFileType } from '@/app/lib/services/fileParser';
import { ToolbarActions } from './ToolbarActions';

type Props = {
  documents: UserFileType[];
  showModal: ModalStateProps;
  deleteLoading: boolean;
  toggleModal: (fileId: string | null) => void;
  onAddDocument: (newDocument: UserFileType) => void;
  onRemoveDocument: (documentId: string) => void;
  handlePrefetch: (path: string) => void;
  handleDelete: (
    organization_id: string,
    documentId: string,
    fileName: string
  ) => void;
};

export type UserFileTypeSafe = UserFileType & { file_type: SupportedFileType };

type DocumentRowProps = {
  document: UserFileTypeSafe;
  showModal: ModalStateProps;
  deleteLoading: boolean;
  handleDelete: (
    organization_id: string,
    documentId: string,
    fileName: string
  ) => void;
  toggleModal: (fileId: string | null) => void;
  onRemoveDocument: (documentId: string) => void;
  handlePrefetch: (path: string) => void;
};

export type ModalStateProps = {
  isOpen: boolean;
  fileId: string | null;
};

const DocumentRow = ({
  document,
  showModal,
  deleteLoading,
  toggleModal,
  handlePrefetch,
  handleDelete,
}: DocumentRowProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const { created_at, updated_at, file_name, file_size, id, organization_id } =
    document;

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
      {showModal.isOpen && showModal.fileId === document.id && (
        <DeleteFileModal
          toggleModal={toggleModal}
          handleDelete={handleDelete}
          organization_id={organization_id}
          documentId={document.id}
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
            id={`tooltip-${id}`}
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
            documentId={id}
            fileName={file_name}
            onPrefetch={handlePrefetch}
            toggleModal={toggleModal}
            isLoading={isLoading}
          />
        </CommonUi.TableCell>
      </CommonUi.TableRow>
    </>
  );
};

export const UserDocumentsTable = ({
  documents,
  showModal,
  deleteLoading,
  toggleModal,
  handleDelete,
  onRemoveDocument,
  handlePrefetch,
}: Props & ComponentProps<'table'>) => {
  const t = useTranslations('files-table');
  const [searchValue, setSearchValue] = useState('');

  const filteredDocuments = useMemo(() => {
    if (!searchValue) {
      return documents as UserFileTypeSafe[];
    }

    return documents.filter(
      (doc) =>
        doc.file_name.toLowerCase().includes(searchValue.toLowerCase()) &&
        doc.project?.title === 'Default'
    ) as UserFileTypeSafe[];
  }, [documents, searchValue]);

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
            filteredDocuments.map((document) => (
              <DocumentRow
                deleteLoading={deleteLoading}
                key={document.id}
                document={document}
                showModal={showModal}
                toggleModal={toggleModal}
                handleDelete={handleDelete}
                onRemoveDocument={onRemoveDocument}
                handlePrefetch={handlePrefetch}
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
