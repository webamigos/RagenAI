'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  EllipsisHorizontalIcon,
  StarIcon as StarIconOutline,
  PencilSquareIcon,
  TrashIcon,
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toggleThreadStarred, renameThread, deleteThread } from '@/app/actions';

type ThreadInfo = {
  public_id: string;
  is_starred: boolean;
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
};

export const ThreadDropdownMenu = ({
  thread,
  onStarred,
  onRenamed,
  onDeleted,
  triggerClassName,
  align = 'end',
  side = 'bottom',
}: Props) => {
  const t = useTranslations('thread-actions');
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const handleStar = async () => {
    const newStarred = !thread.is_starred;
    onStarred?.(thread.public_id, newStarred);
    const result = await toggleThreadStarred(thread.public_id, newStarred);
    if (!result.success) {
      onStarred?.(thread.public_id, thread.is_starred);
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
    onRenamed?.(thread.public_id, renameValue.trim());
    await renameThread(thread.public_id, renameValue.trim());
  };

  const handleDelete = async () => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }
    setIsConfirmingDelete(false);
    onDeleted?.(thread.public_id);
    await deleteThread(thread.public_id);
  };

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) {
            setIsConfirmingDelete(false);
          }
        }}
      >
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
            {thread.is_starred ? (
              <StarIconSolid className="size-4 text-yellow-500" />
            ) : (
              <StarIconOutline className="size-4" />
            )}
            {thread.is_starred ? t('unstar') : t('star')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRenameStart}>
            <PencilSquareIcon className="size-4" />
            {t('rename')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={handleDelete}>
            <TrashIcon className="size-4" />
            {isConfirmingDelete ? t('delete-confirm') : t('delete')}
          </DropdownMenuItem>
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
    </>
  );
};
