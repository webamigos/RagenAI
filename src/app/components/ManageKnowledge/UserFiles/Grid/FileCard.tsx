import prettyBytes from 'pretty-bytes';
import { format } from 'date-fns';

import { truncateFileName } from '@/app/lib/utils/truncateFileName';
import { getFileIcon } from '@/app/lib/constants/fileIcons';
import { Text, Tooltip, InformationCircle } from '@ragenai/common-ui';

import type { UserFileTypeSafe } from '../FileList/UserDocumentsTable';
import { FileInfoPopup } from './FileInfoPopup';
import { useModalWithEscapeAndOutsideClick } from '@/app/hooks/useModalWithEscapeAndOutsideClick';

export const FileCard = ({ document }: { document: UserFileTypeSafe }) => {
  const { isOpen, openModal, modalRef } =
    useModalWithEscapeAndOutsideClick<HTMLDivElement>();

  const { file_name, file_size, file_type, id, created_at, updated_at } =
    document;

  const fileIcon = getFileIcon(file_type);
  const formattedCreatedAt = created_at
    ? format(new Date(created_at), 'yyyy-MM-dd HH:mm')
    : 'N/A';
  const formattedUpdatedAt = updated_at
    ? format(new Date(updated_at), 'yyyy-MM-dd HH:mm')
    : 'N/A';

  return (
    <div className="p-4 border w-full bg-slate-100 dark:bg-accent-dark-500 rounded-lg shadow relative">
      <div className="flex items-center justify-between">
        <p className="mr-2">{fileIcon}</p>
        <Tooltip
          delayShow={1000}
          place="top"
          content={file_name}
          id={`tooltip-${id}`}
        >
          <Text fontSize="sm">{truncateFileName(file_name, 20)}</Text>
        </Tooltip>
        <button onClick={openModal}>
          <InformationCircle className="cursor-pointer" />
        </button>
      </div>
      <div className="bg-slate-200 rounded-lg mt-2 p-2">
        <p>{prettyBytes(file_size)}</p>
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
