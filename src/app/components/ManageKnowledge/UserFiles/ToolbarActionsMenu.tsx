'use client';

import { useTranslations } from 'next-intl';
import {
  PencilSquareIcon,
  EyeIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Link } from '@/i18n/routing';
import { SpinnerSVG } from '@ragenai/common-ui/icons';
import { Tooltip } from '@ragenai/common-ui/Tooltip';

const ACTION_BTN_CLS =
  'inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground transition-colors';

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
  const t = useTranslations('files-table');

  return (
    <>
      {documentId && (
        <Tooltip
          id={`edit-${fileId}`}
          content={t('edit')}
          place="top"
          delayShow={600}
        >
          <Link
            className={ACTION_BTN_CLS}
            href={`/document/${documentId}?edit=true`}
          >
            <PencilSquareIcon className="size-5" />
          </Link>
        </Tooltip>
      )}

      {documentId && (
        <Tooltip
          id={`view-${fileId}`}
          content={t('view')}
          place="top"
          delayShow={600}
        >
          <Link className={ACTION_BTN_CLS} href={`/document/${documentId}`}>
            <EyeIcon className="size-5" />
          </Link>
        </Tooltip>
      )}

      {fileId && (
        <Tooltip
          id={`delete-${fileId}`}
          content={t('delete')}
          place="top"
          delayShow={600}
        >
          <button
            type="button"
            onClick={() => toggleModal(fileId)}
            className={`${ACTION_BTN_CLS} cursor-pointer hover:text-red-500`}
            disabled={isLoading}
          >
            {isLoading ? (
              <SpinnerSVG className="size-5" size="sm" />
            ) : (
              <TrashIcon className="size-5" />
            )}
          </button>
        </Tooltip>
      )}
    </>
  );
};
