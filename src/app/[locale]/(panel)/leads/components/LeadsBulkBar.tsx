'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import {
  TrashIcon,
  FolderPlusIcon,
  FolderIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { LeadListSummary } from '@/features/leads/contracts/lead-list.types';

function DialogCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      <XMarkIcon className="size-4" />
    </button>
  );
}
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@ragenai/tui/dialog';
import { Button } from '@ragenai/tui/button';
import { Input } from '@ragenai/tui/input';
import {
  deleteLeads,
  createListFromLeads,
  addLeadsToList,
  getLeadLists,
} from '@/app/actions/leads';

type Props = {
  leadListPublicId: string;
  selectedIds: string[];
  clearSelection: () => void;
};

export function LeadsBulkBar({
  leadListPublicId,
  selectedIds,
  clearSelection,
}: Props) {
  const t = useTranslations('leads-page');
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [addListOpen, setAddListOpen] = useState(false);
  const [availableLists, setAvailableLists] = useState<LeadListSummary[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [isCreating, startCreate] = useTransition();
  const [isAdding, startAdd] = useTransition();

  // Refetch the list of lists each time the dropdown opens so a list the user
  // just created in this view shows up immediately.
  useEffect(() => {
    if (!addListOpen) {
      return;
    }
    let cancelled = false;
    setListsLoading(true);
    getLeadLists()
      .then((lists) => {
        if (!cancelled) {
          setAvailableLists(lists);
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error(t('bulk-add-list-failed'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setListsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [addListOpen, t]);

  const handleAddToList = (target: LeadListSummary) => {
    startAdd(async () => {
      try {
        const res = await addLeadsToList({
          sourceListPublicId: leadListPublicId,
          targetListPublicId: target.publicId,
          leadPublicIds: selectedIds,
        });
        toast.success(
          t('bulk-add-list-success', { count: res.added, name: target.name }),
        );
        clearSelection();
        setAddListOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : t('bulk-add-list-failed'),
        );
      }
    });
  };

  const handleDelete = () => {
    startDelete(async () => {
      try {
        const res = await deleteLeads({
          leadListPublicId,
          leadPublicIds: selectedIds,
        });
        toast.success(t('bulk-delete-success', { count: res.deleted }));
        clearSelection();
        setConfirmDelete(false);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : t('bulk-delete-failed'),
        );
      }
    });
  };

  const handleCreate = () => {
    const name = newListName.trim();
    if (!name) {
      return;
    }
    startCreate(async () => {
      try {
        const res = await createListFromLeads({
          sourceListPublicId: leadListPublicId,
          name,
          leadPublicIds: selectedIds,
        });
        toast.success(
          t('bulk-new-list-success', { count: res.rowCount, name }),
        );
        clearSelection();
        setNewListOpen(false);
        setNewListName('');
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : t('bulk-new-list-failed'),
        );
      }
    });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {t('bulk-selected', { count: selectedIds.length })}
          </span>
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <XMarkIcon className="size-3.5" />
            {t('bulk-clear')}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Popover open={addListOpen} onOpenChange={setAddListOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <FolderIcon className="size-3.5" />
                {t('bulk-add-to-list')}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-1">
              <AddToListMenu
                lists={availableLists.filter(
                  (l) => l.publicId !== leadListPublicId,
                )}
                isLoading={listsLoading}
                isAdding={isAdding}
                onPick={handleAddToList}
                onCreateNew={() => {
                  setAddListOpen(false);
                  setNewListOpen(true);
                }}
              />
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={() => setNewListOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <FolderPlusIcon className="size-3.5" />
            {t('bulk-new-list')}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            <TrashIcon className="size-3.5" />
            {t('bulk-delete')}
          </button>
        </div>
      </div>

      <Dialog open={confirmDelete} onClose={setConfirmDelete}>
        <DialogCloseButton onClick={() => setConfirmDelete(false)} />
        <DialogTitle>{t('bulk-delete-confirm-title')}</DialogTitle>
        <DialogBody>
          {t('bulk-delete-confirm-description', { count: selectedIds.length })}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setConfirmDelete(false)}>
            {t('cancel')}
          </Button>
          <Button color="red" onClick={handleDelete} disabled={isDeleting}>
            {t('bulk-delete')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={newListOpen} onClose={setNewListOpen}>
        <DialogCloseButton onClick={() => setNewListOpen(false)} />
        <DialogTitle>{t('bulk-new-list-dialog-title')}</DialogTitle>
        <DialogBody>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            {t('bulk-new-list-dialog-description', {
              count: selectedIds.length,
            })}
          </p>
          <label
            htmlFor="new-list-name"
            className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {t('rename-dialog-label')}
          </label>
          <Input
            id="new-list-name"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder={t('import-dialog-name-placeholder')}
            maxLength={120}
            autoFocus
          />
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setNewListOpen(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || newListName.trim().length === 0}
          >
            {t('bulk-new-list-submit')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function AddToListMenu({
  lists,
  isLoading,
  isAdding,
  onPick,
  onCreateNew,
}: {
  lists: LeadListSummary[];
  isLoading: boolean;
  isAdding: boolean;
  onPick: (list: LeadListSummary) => void;
  onCreateNew: () => void;
}) {
  const t = useTranslations('leads-page');
  return (
    <>
      <button
        type="button"
        onClick={onCreateNew}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <FolderPlusIcon className="size-3.5" />
        {t('bulk-add-list-create-new')}
      </button>
      <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
      <div className="max-h-64 overflow-y-auto">
        <AddToListItems
          lists={lists}
          isLoading={isLoading}
          isAdding={isAdding}
          onPick={onPick}
        />
      </div>
    </>
  );
}

function AddToListItems({
  lists,
  isLoading,
  isAdding,
  onPick,
}: {
  lists: LeadListSummary[];
  isLoading: boolean;
  isAdding: boolean;
  onPick: (list: LeadListSummary) => void;
}) {
  const t = useTranslations('leads-page');
  if (isLoading) {
    return (
      <div className="px-2 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        {t('bulk-add-list-loading')}
      </div>
    );
  }
  if (lists.length === 0) {
    return (
      <div className="px-2 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        {t('bulk-add-list-empty')}
      </div>
    );
  }
  return (
    <>
      {lists.map((list) => (
        <button
          key={list.publicId}
          type="button"
          onClick={() => onPick(list)}
          disabled={isAdding}
          className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <span className="truncate">{list.name}</span>
          <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
            {list.rowCount}
          </span>
        </button>
      ))}
    </>
  );
}
