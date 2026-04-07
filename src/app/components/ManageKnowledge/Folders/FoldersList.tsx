'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  FolderIcon,
  DocumentTextIcon,
  UserIcon,
  UsersIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { statusToast } from '@/app/lib/utils/toast';
import { getFolders, deleteFolder } from '@/app/actions/folders';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DocumentFolderItem } from '@/features/documents/contracts/document.types';
import { buildFolderTree } from '@/features/documents/utils/folder-tree';

export type ViewMode = 'all' | 'my-files' | 'shared-with-me';

type Props = {
  initialFolders: DocumentFolderItem[];
  onSelectFolder?: (folderId: string | null, viewMode?: ViewMode) => void;
  selectedFolderId?: string | null;
  selectedViewMode?: ViewMode;
};

const navItemBase =
  'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors';
const navItemActive =
  'bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-900/30 dark:text-indigo-300';
const navItemInactive =
  'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800';

function countTotalFiles(folder: DocumentFolderItem): number {
  let total = folder.fileCount;
  if (folder.children) {
    for (const child of folder.children) {
      total += countTotalFiles(child);
    }
  }
  return total;
}

export function FoldersList({
  initialFolders,
  onSelectFolder,
  selectedFolderId,
  selectedViewMode = 'all',
}: Props) {
  const t = useTranslations('folders');
  const { successToast, errorToast } = statusToast();
  const [folders, setFolders] = useState(initialFolders);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [deletingFolder, setDeletingFolder] = useState<{
    id: string;
    name: string;
    totalFiles: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setFolders(initialFolders);
  }, [initialFolders]);

  const refreshFolders = useCallback(async () => {
    const updated = await getFolders();
    setFolders(updated);
  }, []);

  const handleDeleteFolder = useCallback(async () => {
    if (!deletingFolder) {
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteFolder(deletingFolder.id);

      if (result.success) {
        successToast({ message: t('folder-deleted') });
        refreshFolders();
        if (selectedFolderId === deletingFolder.id) {
          onSelectFolder?.(null, 'all');
        }
      } else {
        errorToast({ message: result.error || t('failed-to-delete') });
      }
    } catch {
      errorToast({ message: t('failed-to-delete') });
    } finally {
      setIsDeleting(false);
      setDeletingFolder(null);
    }
  }, [
    deletingFolder,
    t,
    successToast,
    errorToast,
    refreshFolders,
    selectedFolderId,
    onSelectFolder,
  ]);

  const toggleExpand = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const folderTree = buildFolderTree(folders);

  const findFolderInTree = useCallback(
    (id: string, tree: DocumentFolderItem[]): DocumentFolderItem | null => {
      for (const folder of tree) {
        if (folder.id === id) {
          return folder;
        }
        if (folder.children) {
          const found = findFolderInTree(id, folder.children);
          if (found) {
            return found;
          }
        }
      }
      return null;
    },
    [],
  );

  const openDeleteDialog = useCallback(
    (folderId: string, folderName: string) => {
      const folder = findFolderInTree(folderId, folderTree);
      const totalFiles = folder ? countTotalFiles(folder) : 0;
      setDeletingFolder({ id: folderId, name: folderName, totalFiles });
    },
    [findFolderInTree, folderTree],
  );

  const renderFolder = (folder: DocumentFolderItem, depth: number = 0) => {
    const hasChildren = folder.children && folder.children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected =
      selectedFolderId === folder.id && selectedViewMode === 'all';

    return (
      <div key={folder.id}>
        <div className="group relative">
          <button
            type="button"
            className={`${navItemBase} ${isSelected ? navItemActive : navItemInactive}`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => onSelectFolder?.(folder.id, 'all')}
          >
            {hasChildren ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(folder.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleExpand(folder.id);
                  }
                }}
                className="shrink-0"
              >
                {isExpanded ? (
                  <ChevronDownIcon className="size-3.5 text-gray-400" />
                ) : (
                  <ChevronRightIcon className="size-3.5 text-gray-400" />
                )}
              </span>
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <FolderIcon className="size-4 shrink-0 text-gray-400" />
            <span className="truncate">{folder.name}</span>
            {folder.fileCount > 0 && (
              <span className="shrink-0 text-xs text-gray-400 ml-auto mr-5">
                {folder.fileCount}
              </span>
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <EllipsisHorizontalIcon className="size-4 text-gray-500 dark:text-gray-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" className="w-40">
              <DropdownMenuItem
                variant="destructive"
                onClick={() => openDeleteDialog(folder.id, folder.name)}
              >
                <TrashIcon className="size-4" />
                {t('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {folder.children!.map((child) => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-1">
        {/* Navigation items */}
        <button
          onClick={() => onSelectFolder?.(null, 'all')}
          className={`${navItemBase} ${
            selectedFolderId === null && selectedViewMode === 'all'
              ? navItemActive
              : navItemInactive
          }`}
        >
          <DocumentTextIcon className="size-4 shrink-0" />
          <span>{t('all-files')}</span>
        </button>

        {/* Folder tree - indented under All files */}
        <div className="ml-1">
          {folderTree.map((folder) => renderFolder(folder))}
        </div>

        <div className="!my-2 border-t border-gray-200 dark:border-gray-700" />

        <button
          onClick={() => onSelectFolder?.(null, 'my-files')}
          className={`${navItemBase} ${
            selectedViewMode === 'my-files' ? navItemActive : navItemInactive
          }`}
        >
          <UserIcon className="size-4 shrink-0" />
          <span>{t('my-files')}</span>
        </button>

        <button
          onClick={() => onSelectFolder?.(null, 'shared-with-me')}
          className={`${navItemBase} ${
            selectedViewMode === 'shared-with-me'
              ? navItemActive
              : navItemInactive
          }`}
        >
          <UsersIcon className="size-4 shrink-0" />
          <span>{t('shared-with-me')}</span>
        </button>
      </div>

      <AlertDialog
        open={!!deletingFolder}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeletingFolder(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('delete-title', { folderName: deletingFolder?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingFolder && deletingFolder.totalFiles > 0
                ? t('delete-confirm-with-files', {
                    count: deletingFolder.totalFiles,
                  })
                : t('delete-confirm-empty')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFolder}
              disabled={isDeleting}
              className="border-red-300 bg-transparent text-red-600 hover:bg-red-600 hover:text-white dark:border-red-700 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white"
            >
              {isDeleting ? t('deleting') : t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
