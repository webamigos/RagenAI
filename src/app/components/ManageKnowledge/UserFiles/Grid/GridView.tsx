import { useTranslations } from 'next-intl';

import { SpinnerSVG } from '@ragenai/common-ui/icons';
import { statusToast } from '@/app/lib/utils/toast';
import { Text } from '@ragenai/common-ui/Text';

import { FileCard } from './FileCard';
import { DeleteFileModal } from '../DeleteFileModal';

import {
  type ModalStateProps,
  type UserFileTypeSafe,
} from '../FileList/UserDocumentsTable';
import { type UserFileType } from '@/app/contracts/Documents';
import { SupportedFileType } from '@/app/lib/services/fileParser';

type GridViewProps = {
  documents: UserFileType[];
  isLoading: boolean;
  isError: boolean;
  showModal: ModalStateProps;
  deleteLoading: boolean;
  toggleModal: (fileId: string | null) => void;
  addDocument: (newDocument: UserFileType) => void;
  removeDocument: (documentId: string) => void;
  handlePrefetch: (path: string) => void;
  handleDelete: (
    organization_id: string,
    documentId: string,
    fileName: string
  ) => void;
};

export const GridView = ({
  documents,
  isLoading,
  deleteLoading,
  isError,
  showModal,
  handleDelete,
  toggleModal,
  handlePrefetch,
}: GridViewProps) => {
  const t = useTranslations('error-toast');
  const { errorToast } = statusToast();

  if (isLoading) {
    return <SpinnerSVG size="sm" />;
  }

  if (isError) {
    errorToast({ message: t('fetching-error') });
    return null;
  }

  if (documents.length === 0) {
    return (
      <div className="flex justify-center mt-[3.8rem]">
        <Text fontSize="sm" className="text-gray-500">
          {t('no-files')}
        </Text>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mt-10">
      {documents.map((doc) => {
        const safeDoc: UserFileTypeSafe = {
          ...doc,
          file_type: doc.file_type as SupportedFileType,
        };

        return (
          <>
            {showModal.isOpen && showModal.fileId === safeDoc.id && (
              <DeleteFileModal
                toggleModal={toggleModal}
                handleDelete={handleDelete}
                fileName={safeDoc.file_name}
                documentId={safeDoc.id}
                organization_id={safeDoc.organization_id}
                isLoading={deleteLoading}
              />
            )}
            <FileCard
              key={safeDoc.id}
              document={safeDoc}
              isLoading={isLoading}
              toggleModal={toggleModal}
              handlePrefetch={handlePrefetch}
            />
          </>
        );
      })}
    </div>
  );
};
