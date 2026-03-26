'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  EllipsisHorizontalIcon,
  StarIcon as StarIconOutline,
  PencilSquareIcon,
  TrashIcon,
  ShareIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { ShareThreadDialog } from '@/app/components/ShareThreadDialog';

type ThreadInfo = {
  publicId: string;
  isStarred: boolean;
  title?: string | null;
  messages?: { content: string }[];
};

type Props = {
  thread: ThreadInfo;
  onStarred?: (threadPublicId: string, isStarred: boolean) => void;
  onRenamed?: (threadPublicId: string, newTitle: string) => void;
  onDeleted?: (threadPublicId: string) => void;
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

  const handleStar = async () => {
    const newStarred = !thread.isStarred;
    onStarred?.(thread.publicId, newStarred);
    const result = await toggleThreadStarred(thread.publicId, newStarred);
    if (!result.success) {
      onStarred?.(thread.publicId, thread.isStarred);
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
    onRenamed?.(thread.publicId, renameValue.trim());
    await renameThread(thread.publicId, renameValue.trim());
  };

  const handleDelete = async () => {
    setIsDeleteOpen(false);
    onDeleted?.(thread.publicId);
    await deleteThread(thread.publicId);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
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
              <DropdownMenuItem onClick={handleRenameStart}>
                <PencilSquareIcon className="size-4" />
                {t('rename')}
              </DropdownMenuItem>
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
        threadPublicId={thread.publicId}
      />
    </>
  );
};
