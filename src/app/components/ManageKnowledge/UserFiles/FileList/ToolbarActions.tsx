import { useState } from 'react';
import { Link } from '@/i18n/routing';
import * as CommonUi from '@ragenai/common-ui';
// import { type ModalStateProps } from '../DeleteFileModal';

type ToolbarActionsProps = {
  documentId: string;
  fileName: string;
  onDelete: () => void;
  onPrefetch: (path: string) => void;
  toggleModal: (fileId: string | null) => void;
  isLoading: boolean;
};

export const ToolbarActions = ({
  documentId,
  // fileName,
  // onDelete,
  onPrefetch,
  toggleModal,
  isLoading,
}: ToolbarActionsProps) => {
  const [showToolbar, setShowToolbar] = useState(false);

  return (
    <div
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
      className="relative flex items-center space-x-2 z-50"
    >
      <div
        className={`absolute -left-10 flex space-x-2 transition-all duration-300 ${
          showToolbar
            ? 'opacity-100 -translate-x-0'
            : 'opacity-0 -translate-x-4'
        }`}
      >
        <Link
          className="text-black dark:text-white"
          href={`/document/${documentId}?edit=true`}
          onMouseEnter={() => onPrefetch(`/document/${documentId}?edit=true`)}
        >
          <CommonUi.PencilIcon className="mt-0.5 cursor-pointer" />
        </Link>
        <Link
          className="text-black dark:text-white"
          href={`/document/${documentId}`}
          onMouseEnter={() => onPrefetch(`/document/${documentId}`)}
        >
          <CommonUi.OpenEyeIcon className="cursor-pointer" />
        </Link>
        <div
          onClick={() => toggleModal(documentId)}
          className="mt-0.5 cursor-pointer"
        >
          {isLoading ? (
            <CommonUi.SpinnerSVG className="mt-0.5 ml-0.5" size="sm" />
          ) : (
            <CommonUi.TrashIcon />
          )}
        </div>
      </div>
      <div
        className={`transition-all duration-300 ${
          showToolbar ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
        }`}
      >
        <CommonUi.ArrowIcon className="cursor-pointer" />
      </div>
    </div>
  );
};
