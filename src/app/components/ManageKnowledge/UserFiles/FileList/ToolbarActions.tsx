'use client';

import { useTranslations } from 'next-intl';
import { EllipsisVerticalIcon } from '@heroicons/react/20/solid';
import {
  PencilSquareIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useRouter } from '@/i18n/routing';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DropdownDivider,
} from '@ragenai/tui/dropdown';

type ToolbarActionsProps = {
  filePublicId: string;
  documentPublicId?: string;
  fileName: string;
  toggleModal: (fileId: string | null) => void;
  isLoading: boolean;
};

export const ToolbarActions = ({
  filePublicId,
  documentPublicId,
  fileName,
  toggleModal,
  isLoading,
}: ToolbarActionsProps) => {
  const t = useTranslations('files-table');
  const router = useRouter();

  return (
    <Dropdown>
      <DropdownButton
        plain
        aria-label="Actions"
        className="!p-1.5 !rounded-md hover:bg-zinc-950/5 dark:hover:bg-white/5"
      >
        <EllipsisVerticalIcon className="size-5 text-zinc-500" />
      </DropdownButton>

      <DropdownMenu anchor="bottom end" className="[&_[data-slot=icon]]:mr-2">
        {documentPublicId && (
          <DropdownItem
            onClick={() => router.push(`/document/${documentPublicId}`)}
          >
            <EyeIcon className="size-4" data-slot="icon" />
            {t('view')}
          </DropdownItem>
        )}

        {documentPublicId && (
          <DropdownItem
            onClick={() =>
              router.push(`/document/${documentPublicId}?edit=true`)
            }
          >
            <PencilSquareIcon className="size-4" data-slot="icon" />
            {t('edit')}
          </DropdownItem>
        )}

        {filePublicId && (
          <DropdownItem
            onClick={() => {
              const link = document.createElement('a');
              link.href = `/api/files/${filePublicId}`;
              link.download = fileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
          >
            <ArrowDownTrayIcon className="size-4" data-slot="icon" />
            {t('download')}
          </DropdownItem>
        )}

        {filePublicId && <DropdownDivider />}

        {filePublicId && (
          <DropdownItem
            onClick={() => toggleModal(filePublicId)}
            disabled={isLoading}
          >
            <TrashIcon
              data-slot="icon"
              className="!size-4 !text-red-500 !fill-none !stroke-red-500"
            />
            <span className="text-red-600 dark:text-red-400">
              {t('delete')}
            </span>
          </DropdownItem>
        )}
      </DropdownMenu>
    </Dropdown>
  );
};
