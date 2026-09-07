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
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { useRouter } from '@/i18n/routing';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

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
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {/* `plain` becomes the ghost variant, which already carries the hover
            background the old classes were adding by hand. */}
        <Button
          variant="ghost"
          aria-label="Actions"
          className="!p-1.5 !rounded-md"
        >
          <EllipsisVerticalIcon className="size-5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="[&_[data-slot=icon]]:mr-2">
        {documentId && (
          <DropdownMenuItem
            onClick={() => router.push(`/document/${documentId}`)}
          >
            <EyeIcon className="size-4" />
            {t('view')}
          </DropdownMenuItem>
        )}

        {documentId && (
          <DropdownMenuItem
            onClick={() => router.push(`/document/${documentId}?edit=true`)}
          >
            <PencilSquareIcon className="size-4" />
            {t('edit')}
          </DropdownMenuItem>
        )}

        {fileId && (
          <DropdownMenuItem
            onClick={() => {
              const link = document.createElement('a');
              link.href = `/api/files/${fileId}`;
              link.download = fileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
          >
            <ArrowDownTrayIcon className="size-4" />
            {t('download')}
          </DropdownMenuItem>
        )}

        {fileId && onMove && (
          <DropdownMenuItem onClick={() => onMove(fileId)}>
            <ArrowRightIcon className="size-4" />
            {t('move') || 'Move'}
          </DropdownMenuItem>
        )}

        {fileId && onShare && (
          <DropdownMenuItem onClick={() => onShare(fileId)}>
            <ShareIcon className="size-4" />
            {t('share') || 'Share'}
          </DropdownMenuItem>
        )}

        {fileId && onScore && (
          <DropdownMenuItem
            onClick={() => onScore(fileId)}
            disabled={isScoringLoading}
          >
            <ChartBarIcon className="size-4" />
            {t('score-rag')}
          </DropdownMenuItem>
        )}

        {documentId && (
          <DropdownMenuItem
            onClick={() =>
              router.push(
                `/knowledge/documents/${documentId}?tab=optimize` as never,
              )
            }
          >
            <SparklesIcon className="size-4" />
            {t('optimize-rag')}
          </DropdownMenuItem>
        )}

        {fileId && <DropdownMenuSeparator />}

        {fileId && (
          <DropdownMenuItem
            onClick={() => toggleModal(fileId)}
            disabled={isLoading}
          >
            <TrashIcon className="!size-4 !text-red-500 !fill-none !stroke-red-500" />
            <span className="text-red-600 dark:text-red-400">
              {t('delete')}
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
