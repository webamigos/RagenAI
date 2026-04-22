'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  EllipsisHorizontalIcon,
  StarIcon as StarIconOutline,
  PencilSquareIcon,
  TrashIcon,
  ShareIcon,
  ArrowDownTrayIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toggleThreadStarred, renameThread, deleteThread } from '@/app/actions';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';
import { ShareThreadDialog } from '@/app/components/ShareThreadDialog';
import { PublicShareDialog } from '@/app/components/PublicShareDialog';

type ThreadInfo = {
  id: string;
  isStarred: boolean;
  title?: string | null;
  messages?: { content: string }[];
};

type Props = {
  thread: ThreadInfo;
  onStarred?: (threadId: string, isStarred: boolean) => void;
  onRenamed?: (threadId: string, newTitle: string) => void;
  onDeleted?: (threadId: string) => void;
  triggerClassName?: string;
  align?: 'start' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  isOwner?: boolean;
};

export const ThreadDropdownMenu = ({
  thread,
  onStarred,
  onRenamed,
  onDeleted,
  triggerClassName,
  align = 'end',
  side = 'bottom',
  isOwner = true,
}: Props) => {
  const t = useTranslations('thread-actions');
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isPublicShareOpen, setIsPublicShareOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleStar = async () => {
    const newStarred = !thread.isStarred;
    onStarred?.(thread.id, newStarred);
    const result = await toggleThreadStarred(thread.id, newStarred);
    if (!result.success) {
      onStarred?.(thread.id, thread.isStarred);
    }
  };

  const handleRenameStart = () => {
    const currentTitle = thread.title || thread.messages?.[0]?.content || '';
    setRenameValue(currentTitle);
    setIsRenameOpen(true);
  };

  const handleRenameSubmit = async () => {
    if (!renameValue.trim()) {
      return;
    }
    setIsRenameOpen(false);
    onRenamed?.(thread.id, renameValue.trim());
    await renameThread(thread.id, renameValue.trim());
  };

  const handleDelete = async () => {
    setIsDeleteOpen(false);
    onDeleted?.(thread.id);
    await deleteThread(thread.id);
  };

  const handleExport = async (format: 'md' | 'pdf') => {
    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/threads/${thread.id}/export?format=${format}`,
      );
      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `thread-export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error({ err }, 'Thread export failed');
      const { errorToast } = statusToast();
      errorToast({ message: t('export-error') });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="thread-menu-trigger"
            className={
              triggerClassName ??
              'p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100'
            }
            onClick={(e) => e.preventDefault()}
          >
            <EllipsisHorizontalIcon className="size-4 text-zinc-500 dark:text-zinc-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} side={side} className="w-44">
          <DropdownMenuItem onClick={handleStar}>
            {thread.isStarred ? (
              <StarIconSolid className="size-4 text-yellow-500" />
            ) : (
              <StarIconOutline className="size-4" />
            )}
            {thread.isStarred ? t('unstar') : t('star')}
          </DropdownMenuItem>
          {isOwner && (
            <>
              <DropdownMenuItem onClick={() => setIsShareOpen(true)}>
                <ShareIcon className="size-4" />
                {t('share')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsPublicShareOpen(true)}>
                <GlobeAltIcon className="size-4" />
                {t('share-public')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRenameStart}>
                <PencilSquareIcon className="size-4" />
                {t('rename')}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={isExporting}>
                  <ArrowDownTrayIcon className="size-4" />
                  {t('export')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => handleExport('md')}>
                    {t('export-markdown')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('pdf')}>
                    {t('export-pdf')}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setIsDeleteOpen(true)}
              >
                <TrashIcon className="size-4" />
                {t('delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('rename-title')}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleRenameSubmit();
              }
            }}
            onFocus={(e) => e.target.select()}
            className="selection:bg-blue-200 selection:text-zinc-900 dark:selection:bg-blue-800 dark:selection:text-white"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleRenameSubmit} disabled={!renameValue.trim()}>
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete-title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete-confirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="border-red-300 bg-transparent text-red-600 hover:bg-red-600 hover:text-white dark:border-red-700 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white"
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShareThreadDialog
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        threadId={thread.id}
      />

      <PublicShareDialog
        isOpen={isPublicShareOpen}
        onClose={() => setIsPublicShareOpen(false)}
        threadId={thread.id}
      />
    </>
  );
};
