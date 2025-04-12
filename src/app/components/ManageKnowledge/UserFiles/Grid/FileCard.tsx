import { format } from 'date-fns';

import { truncateFileName } from '@/app/lib/utils/truncateFileName';
import { getFileIcon } from '@/app/lib/constants/fileIcons';
import { Text, Tooltip, InformationCircle } from '@ragenai/common-ui';

import type { UserFileTypeSafe } from '../FileList/UserDocumentsTable';
import { FileInfoPopup } from './FileInfoPopup';
import { useModalWithEscapeAndOutsideClick } from '@/app/hooks/useModalWithEscapeAndOutsideClick';
import { ToolbarActionsMenu } from '../ToolbarActionsMenu';

type Props = {
  file: UserFileTypeSafe;
  isLoading: boolean;
  toggleModal: (fileId: string | null) => void;
  handlePrefetch: (path: string) => void;
};

export const FileCard = ({
  file,
  isLoading,
  toggleModal,
  handlePrefetch,
}: Props) => {
  const { isOpen, openModal, modalRef } =
    useModalWithEscapeAndOutsideClick<HTMLDivElement>();

  const {
    file_name,
    file_size,
    file_type,
    public_id,
    created_at,
    updated_at,
    document,
  } = file;

  const fileIcon = getFileIcon(file_type);
  const formattedCreatedAt = created_at
    ? format(new Date(created_at), 'yyyy-MM-dd HH:mm')
    : '-';
  const formattedUpdatedAt = updated_at
    ? format(new Date(updated_at), 'yyyy-MM-dd HH:mm')
    : '-';

  return (
    <div className="p-4 min-w-48 w-full h-48 pb-10 bg-slate-100 dark:bg-accent-dark-500 hover:bg-slate-200 rounded-md shadow relative group">
      <div className="h-6 flex items-center justify-between">
        <p className="mr-2">{fileIcon}</p>
        <Tooltip
          delayShow={1000}
          place="top"
          content={file_name}
          id={`tooltip-${public_id}`}
        >
          <Text fontSize="xs">{truncateFileName(file_name, 20)}</Text>
        </Tooltip>
        <button onClick={openModal}>
          <InformationCircle className="cursor-pointer" />
        </button>
      </div>
      <div className="flex w-full justify-center bg-white dark:bg-accent-dark-lightness rounded-md mt-2 p-2">
        <div className="flex items-center h-28 gap-2 invisible group-hover:visible justify-evenly transition-opacity duration-200">
          <ToolbarActionsMenu
            toggleModal={toggleModal}
            isLoading={isLoading}
            filePublicId={public_id}
            documentPublicId={document?.public_id}
            onPrefetch={handlePrefetch}
          />
        </div>
      </div>
      {isOpen && (
        <FileInfoPopup
          ref={modalRef}
          createdAt={formattedCreatedAt}
          updatedAt={formattedUpdatedAt}
          fileSize={file_size}
        />
      )}
    </div>
  );
};
