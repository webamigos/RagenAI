import { Link } from '@/i18n/routing';
import {
  PencilIcon,
  OpenEyeIcon,
  SpinnerSVG,
  TrashIcon,
} from '@ragenai/common-ui/icons';

type ToolbarIconsProps = {
  fileId: string;
  documentId?: string;
  toggleModal: (fileId: string | null) => void;
  isLoading: boolean;
};

export const ToolbarActionsMenu = ({
  fileId,
  documentId,
  toggleModal,
  isLoading,
}: ToolbarIconsProps) => {
  return (
    <>
      {documentId && (
        <Link
          className="text-black dark:text-white"
          href={`/document/${documentId}?edit=true`}
        >
          <PencilIcon className="mt-0.5 cursor-pointer" />
        </Link>
      )}

      {documentId && (
        <Link
          className="text-black dark:text-white"
          href={`/document/${documentId}`}
        >
          <OpenEyeIcon className="cursor-pointer" />
        </Link>
      )}

      {fileId && (
        <div
          onClick={() => toggleModal && toggleModal(fileId)}
          className="cursor-pointer"
        >
          {isLoading ? (
            <SpinnerSVG className="mt-0.5 ml-0.5" size="sm" />
          ) : (
            <TrashIcon />
          )}
        </div>
      )}
    </>
  );
};
