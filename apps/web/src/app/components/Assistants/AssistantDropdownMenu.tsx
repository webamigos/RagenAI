'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  EllipsisVerticalIcon,
  StarIcon as StarIconOutline,
  PencilSquareIcon,
  TrashIcon,
  ArchiveBoxIcon,
  ArchiveBoxXMarkIcon,
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
import {
  renameProjectAction,
  archiveProjectAction,
  starProjectAction,
  deleteProjectAction,
} from '@/app/components/Sidebar/Projects/actions';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';
import { useOrgFeature } from '@/app/hooks/useOrgFeatures';

export type AssistantInfo = {
  id: string;
  title: string;
  isStarred: boolean;
  isArchived: boolean;
};

type Props = {
  assistant: AssistantInfo;
  onStarred?: (id: string, isStarred: boolean) => void;
  onRenamed?: (id: string, title: string) => void;
  onArchived?: (id: string, isArchived: boolean) => void;
  onDeleted?: (id: string) => void;
  triggerClassName?: string;
  align?: 'start' | 'end';
};

export function AssistantDropdownMenu({
  assistant,
  onStarred,
  onRenamed,
  onArchived,
  onDeleted,
  triggerClassName,
  align = 'end',
}: Props) {
  const t = useTranslations('assistant-actions');
  const { errorToast } = statusToast();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(assistant.title);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  // Deleting a project takes its documents with it, so it is gated on
  // `manageProjects` rather than on the document flag. Hiding only — the
  // server refuses it either way.
  const canManageProjects = useOrgFeature('manageProjects');

  const handleStar = async () => {
    const next = !assistant.isStarred;
    onStarred?.(assistant.id, next);
    const result = await starProjectAction(assistant.id, next);
    if (!result.success) {
      onStarred?.(assistant.id, assistant.isStarred);
      errorToast({ message: t('error-generic') });
    }
  };

  const handleRenameStart = () => {
    setRenameValue(assistant.title);
    setIsRenameOpen(true);
  };

  const handleRenameSubmit = async () => {
    const next = renameValue.trim();
    if (!next || next === assistant.title) {
      setIsRenameOpen(false);
      return;
    }
    setIsRenameOpen(false);
    onRenamed?.(assistant.id, next);
    const result = await renameProjectAction(assistant.id, next);
    if (!result.success) {
      onRenamed?.(assistant.id, assistant.title);
      errorToast({ message: result.error ?? t('error-generic') });
    }
  };

  const handleArchive = async () => {
    const next = !assistant.isArchived;
    onArchived?.(assistant.id, next);
    const result = await archiveProjectAction(assistant.id, next);
    if (!result.success) {
      onArchived?.(assistant.id, assistant.isArchived);
      errorToast({ message: t('error-generic') });
    }
  };

  const handleDelete = async () => {
    setIsDeleteOpen(false);
    const result = await deleteProjectAction(assistant.id);
    if (result.success) {
      onDeleted?.(assistant.id);
    } else {
      errorToast({ message: t('error-generic') });
      logger.error({ projectId: assistant.id }, 'Assistant delete failed');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="assistant-menu-trigger"
            aria-label={t('menu')}
            className={
              triggerClassName ??
              'p-1.5 rounded-md hover:bg-paper-200 dark:hover:bg-paper-700 transition-colors'
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <EllipsisVerticalIcon className="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56">
          <DropdownMenuItem onClick={handleStar}>
            {assistant.isStarred ? (
              <StarIconSolid className="size-4 text-pending" />
            ) : (
              <StarIconOutline className="size-4" />
            )}
            {assistant.isStarred ? t('unstar') : t('star')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRenameStart}>
            <PencilSquareIcon className="size-4" />
            {t('edit-details')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleArchive}>
            {assistant.isArchived ? (
              <ArchiveBoxXMarkIcon className="size-4" />
            ) : (
              <ArchiveBoxIcon className="size-4" />
            )}
            {assistant.isArchived ? t('unarchive') : t('archive')}
          </DropdownMenuItem>
          {canManageProjects && (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setIsDeleteOpen(true)}
            >
              <TrashIcon className="size-4" />
              {t('delete')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('rename-title')}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRenameSubmit();
              }
            }}
            onFocus={(e) => e.target.select()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsRenameOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handleRenameSubmit}
              disabled={!renameValue.trim()}
              className="bg-brand-600 text-primary-foreground hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
            >
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
              {t('delete-confirm', { name: assistant.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="border-destructive/40 bg-transparent text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
