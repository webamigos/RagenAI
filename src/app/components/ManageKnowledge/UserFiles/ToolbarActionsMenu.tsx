import { Link } from '@/i18n/routing';
import * as CommonUi from '@ragenai/common-ui';

type ToolbarIconsProps = {
  filePublicId: string;
  documentPublicId?: string;
  onPrefetch: (path: string) => void;
  toggleModal: (fileId: string | null) => void;
  isLoading: boolean;
};

export const ToolbarActionsMenu = ({
  filePublicId,
  documentPublicId,
  onPrefetch,
  toggleModal,
  isLoading,
}: ToolbarIconsProps) => {
  return (
    <>
      {documentPublicId && (
        <Link
          className="text-black dark:text-white"
          href={`/document/${documentPublicId}?edit=true`}
          onMouseEnter={() =>
            onPrefetch(`/document/${documentPublicId}?edit=true`)
          }
        >
          <CommonUi.PencilIcon className="mt-0.5 cursor-pointer" />
        </Link>
      )}

      {documentPublicId && (
        <Link
          className="text-black dark:text-white"
          href={`/document/${documentPublicId}`}
          onMouseEnter={() => onPrefetch(`/document/${documentPublicId}`)}
        >
          <CommonUi.OpenEyeIcon className="cursor-pointer" />
        </Link>
      )}

      {documentPublicId && (
        <div
          onClick={() => toggleModal && toggleModal(documentPublicId)}
          className="cursor-pointer"
        >
          {isLoading ? (
            <CommonUi.SpinnerSVG className="mt-0.5 ml-0.5" size="sm" />
          ) : (
            <CommonUi.TrashIcon />
          )}
        </div>
      )}
    </>
  );
};
