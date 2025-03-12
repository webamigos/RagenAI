import { Link } from '@/i18n/routing';
import * as CommonUi from '@ragenai/common-ui';

type ToolbarIconsProps = {
  documentId: string;
  onPrefetch: (path: string) => void;
  toggleModal: (fileId: string | null) => void;
  isLoading: boolean;
};

export const ToolbarActionsMenu = ({
  documentId,
  onPrefetch,
  toggleModal,
  isLoading,
}: ToolbarIconsProps) => {
  return (
    <>
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
        onClick={() => toggleModal && toggleModal(documentId)}
        className="cursor-pointer"
      >
        {isLoading ? (
          <CommonUi.SpinnerSVG className="mt-0.5 ml-0.5" size="sm" />
        ) : (
          <CommonUi.TrashIcon />
        )}
      </div>
    </>
  );
};
