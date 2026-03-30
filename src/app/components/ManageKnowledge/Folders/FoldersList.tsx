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
} from '@heroicons/react/24/outline';
import { statusToast } from '@/app/lib/utils/toast';
import { getFolders, deleteFolder } from '@/app/actions/folders';
import type { DocumentFolderItem } from '@/features/documents/contracts/document.types';
import { buildFolderTree } from '@/features/documents/utils/folder-tree';

export type ViewMode = 'all' | 'my-files' | 'shared-with-me';

type Props = {
  initialFolders: DocumentFolderItem[];
  onSelectFolder?: (folderId: number | null, viewMode?: ViewMode) => void;
  selectedFolderId?: number | null;
  selectedViewMode?: ViewMode;
};

const navItemBase =
  'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors';
const navItemActive =
  'bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-900/30 dark:text-indigo-300';
const navItemInactive =
  'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800';

export function FoldersList({
  initialFolders,
  onSelectFolder,
  selectedFolderId,
  selectedViewMode = 'all',
}: Props) {
  const t = useTranslations('folders');
  const { successToast, errorToast } = statusToast();
  const [folders, setFolders] = useState(initialFolders);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(
    new Set(),
  );

  useEffect(() => {
    setFolders(initialFolders);
  }, [initialFolders]);

  const refreshFolders = useCallback(async () => {
    const updated = await getFolders();
    setFolders(updated);
  }, []);

  const handleDeleteFolder = useCallback(
    async (folderId: number) => {
      if (!confirm(t('delete-confirm'))) {
        return;
      }

      const result = await deleteFolder(folderId);
      if (result.success) {
        successToast({ message: t('folder-deleted') });
        refreshFolders();
        if (selectedFolderId === folderId) {
          onSelectFolder?.(null, 'all');
        }
      } else {
        errorToast({ message: result.error || t('failed-to-delete') });
      }
    },
    [
      t,
      successToast,
      errorToast,
      refreshFolders,
      selectedFolderId,
      onSelectFolder,
    ],
  );

  const toggleExpand = useCallback((folderId: number) => {
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

  const renderFolder = (folder: DocumentFolderItem, depth: number = 0) => {
    const hasChildren = folder.children && folder.children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected =
      selectedFolderId === folder.id && selectedViewMode === 'all';

    return (
      <div key={folder.id}>
        <button
          type="button"
          className={`group ${navItemBase} ${isSelected ? navItemActive : navItemInactive}`}
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
            <span className="shrink-0 text-xs text-gray-400 ml-auto">
              {folder.fileCount}
            </span>
          )}
        </button>
        {hasChildren && isExpanded && (
          <div>
            {folder.children!.map((child) => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
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
  );
}
