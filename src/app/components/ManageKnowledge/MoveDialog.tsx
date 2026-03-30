'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import {
  getFolders,
  moveFileToFolder,
  moveFolder,
} from '@/app/actions/folders';
import { buildFolderTree } from '@/features/documents/utils/folder-tree';
import type { DocumentFolderItem } from '@/features/documents/contracts/document.types';
import { statusToast } from '@/app/lib/utils/toast';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  resourceType: 'file' | 'folder';
  resourceId: string | number; // file publicId or folder id
  resourceName: string;
  currentFolderId?: number | null;
  onMoved: () => void;
};

export function MoveDialog({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  currentFolderId,
  onMoved,
}: Props) {
  const { successToast, errorToast } = statusToast();
  const [folders, setFolders] = useState<DocumentFolderItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(
    new Set(),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getFolders()
        .then(setFolders)
        .catch(() => {});
      setSelectedFolderId(null);
    }
  }, [isOpen]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleMove = async () => {
    setIsSubmitting(true);
    try {
      if (resourceType === 'file') {
        const result = await moveFileToFolder(
          resourceId as string,
          selectedFolderId,
        );
        if (!result.success) {
          errorToast({ message: result.error || 'Failed to move file' });
          return;
        }
      } else {
        const result = await moveFolder(resourceId as number, selectedFolderId);
        if (!result.success) {
          errorToast({ message: result.error || 'Failed to move folder' });
          return;
        }
      }
      successToast({ message: `Moved "${resourceName}"` });
      onMoved();
      onClose();
    } catch {
      errorToast({ message: 'Failed to move' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const folderTree = buildFolderTree(folders);

  const isDisabled = (folderId: number): boolean => {
    // Can't move a folder into itself or its descendants
    if (resourceType === 'folder' && folderId === resourceId) {
      return true;
    }
    // Check if target is a descendant of the folder being moved
    if (resourceType === 'folder') {
      const folder = folders.find((f) => f.id === folderId);
      if (folder?.path.includes(`/${resourceId}/`)) {
        return true;
      }
    }
    return false;
  };

  const renderFolder = (folder: DocumentFolderItem, depth: number = 0) => {
    const hasChildren = folder.children && folder.children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const disabled = isDisabled(folder.id);
    const isCurrent = folder.id === currentFolderId;

    return (
      <div key={folder.id}>
        <button
          type="button"
          disabled={disabled}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
            disabled
              ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
              : isSelected
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
          }`}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
          onClick={() => {
            if (!disabled) {
              setSelectedFolderId(folder.id);
            }
          }}
        >
          {hasChildren && (
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
              className="text-gray-400"
            >
              {isExpanded ? '▾' : '▸'}
            </span>
          )}
          {!hasChildren && <span className="w-3" />}
          <span>📁</span>
          <span className="truncate">{folder.name}</span>
          {isCurrent && (
            <span className="text-xs text-gray-400">(current)</span>
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
    <Dialog open={isOpen} onClose={onClose} size="md">
      <DialogTitle>Move &quot;{resourceName}&quot;</DialogTitle>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Change the location of your {resourceType}.
      </p>

      <div className="mt-4 max-h-80 overflow-y-auto border rounded-md dark:border-gray-700">
        {/* Root level (All files) */}
        <button
          type="button"
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${
            selectedFolderId === null
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
          }`}
          onClick={() => setSelectedFolderId(null)}
        >
          <span>📁</span>
          <span className="font-medium">All Files</span>
          {currentFolderId === null && (
            <span className="text-xs text-gray-400">(current)</span>
          )}
        </button>

        {folderTree.map((folder) => renderFolder(folder))}
      </div>

      <div className="flex justify-end space-x-2 mt-6">
        <Button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleMove}
          disabled={isSubmitting || selectedFolderId === currentFolderId}
        >
          {isSubmitting ? 'Moving...' : 'Move'}
        </Button>
      </div>
    </Dialog>
  );
}
