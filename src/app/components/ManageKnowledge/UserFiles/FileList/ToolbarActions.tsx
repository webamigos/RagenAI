'use client';

import { useTranslations } from 'next-intl';
import { EllipsisVerticalIcon } from '@heroicons/react/20/solid';
import {
  PencilSquareIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  ArrowRightIcon,
  ShareIcon,
  ChartBarIcon,
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
  fileId: string;
  documentId?: string;
  fileName: string;
  folderId?: number | null;
  toggleModal: (fileId: string | null) => void;
  onMove?: (fileId: string) => void;
  onShare?: (fileId: string) => void;
  onScore?: (fileId: string) => void;
  isScoringLoading?: boolean;
  isLoading: boolean;
};

export const ToolbarActions = ({
  fileId,
  documentId,
  fileName,
  toggleModal,
  onMove,
  onShare,
  onScore,
  isScoringLoading,
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
        {documentId && (
          <DropdownItem onClick={() => router.push(`/document/${documentId}`)}>
            <EyeIcon className="size-4" data-slot="icon" />
            {t('view')}
          </DropdownItem>
        )}

        {documentId && (
          <DropdownItem
            onClick={() => router.push(`/document/${documentId}?edit=true`)}
          >
            <PencilSquareIcon className="size-4" data-slot="icon" />
            {t('edit')}
          </DropdownItem>
        )}

        {fileId && (
          <DropdownItem
            onClick={() => {
              const link = document.createElement('a');
              link.href = `/api/files/${fileId}`;
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

        {fileId && onMove && (
          <DropdownItem onClick={() => onMove(fileId)}>
            <ArrowRightIcon className="size-4" data-slot="icon" />
            {t('move') || 'Move'}
          </DropdownItem>
        )}

        {fileId && onShare && (
          <DropdownItem onClick={() => onShare(fileId)}>
            <ShareIcon className="size-4" data-slot="icon" />
            {t('share') || 'Share'}
          </DropdownItem>
        )}

        {fileId && onScore && (
          <DropdownItem
            onClick={() => onScore(fileId)}
            disabled={isScoringLoading}
          >
            <ChartBarIcon className="size-4" data-slot="icon" />
            {t('score-rag')}
          </DropdownItem>
        )}

        {fileId && <DropdownDivider />}

        {fileId && (
          <DropdownItem
            onClick={() => toggleModal(fileId)}
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
