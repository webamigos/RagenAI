'use client';

import { useTranslations } from 'next-intl';
import { EllipsisVerticalIcon } from '@heroicons/react/20/solid';
import {
  PencilSquareIcon,
  EyeIcon,
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

      <DropdownMenu anchor="bottom end">
        {documentPublicId && (
          <DropdownItem
            onClick={() =>
              router.push(`/document/${documentPublicId}?edit=true`)
            }
          >
            <PencilSquareIcon data-slot="icon" />
            {t('edit')}
          </DropdownItem>
        )}

        {documentPublicId && (
          <DropdownItem
            onClick={() => router.push(`/document/${documentPublicId}`)}
          >
            <EyeIcon data-slot="icon" />
            {t('view')}
          </DropdownItem>
        )}

        {documentPublicId && filePublicId && <DropdownDivider />}

        {filePublicId && (
          <DropdownItem
            onClick={() => toggleModal(filePublicId)}
            disabled={isLoading}
          >
            <TrashIcon
              data-slot="icon"
              className="!text-red-500 !fill-none !stroke-red-500"
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
