import { Link } from '@/i18n/routing';
import * as CommonUi from '@ragenai/common-ui';

type ToolbarIconsProps = {
  filePublicId: string;
  documentPublicId?: string;
  toggleModal: (fileId: string | null) => void;
  isLoading: boolean;
};

export const ToolbarActionsMenu = ({
  filePublicId,
  documentPublicId,
  toggleModal,
  isLoading,
}: ToolbarIconsProps) => {
  return (
    <>
      {documentPublicId && (
        <Link
          className="text-black dark:text-white"
          href={`/document/${documentPublicId}?edit=true`}
        >
          <CommonUi.PencilIcon className="mt-0.5 cursor-pointer" />
        </Link>
      )}

      {documentPublicId && (
        <Link
          className="text-black dark:text-white"
          href={`/document/${documentPublicId}`}
        >
          <CommonUi.OpenEyeIcon className="cursor-pointer" />
        </Link>
      )}

      {filePublicId && (
        <div
          onClick={() => toggleModal && toggleModal(filePublicId)}
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
