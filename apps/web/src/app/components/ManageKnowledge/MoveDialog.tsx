'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import {
  getFolders,
  moveFileToFolder,
  moveFolder,
} from '@/app/actions/folders';
import { bulkMoveFilesToFolderAction } from '@/app/actions/bulk-documents';
import { buildFolderTree } from '@/features/documents/utils/folder-tree';
import type { DocumentFolderItem } from '@/features/documents/contracts/document.types';
import { statusToast } from '@/app/lib/utils/toast';

type SingleModeProps = {
  mode?: 'single';
  resourceType: 'file' | 'folder';
  resourceId: string;
  resourceName: string;
  currentFolderId?: string | null;
  onMoved: () => void;
};

type BulkModeProps = {
  mode: 'bulk';
  fileIds: string[];
  onMoved: (
    succeeded: string[],
    failed: { fileId: string; fileName: string; error: string }[],
  ) => void;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
} & (SingleModeProps | BulkModeProps);

export function MoveDialog(props: Props) {
  const { isOpen, onClose } = props;
  const isBulk = props.mode === 'bulk';
  const { successToast, errorToast } = statusToast();
  const [folders, setFolders] = useState<DocumentFolderItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
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

  const toggleExpand = useCallback((id: string) => {
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
      if (isBulk) {
        const result = await bulkMoveFilesToFolderAction(
          (props as BulkModeProps).fileIds,
          selectedFolderId,
        );
        (props as BulkModeProps).onMoved(result.succeeded, result.failed);
        onClose();
      } else {
        const singleProps = props as SingleModeProps;
        if (singleProps.resourceType === 'file') {
          const result = await moveFileToFolder(
            singleProps.resourceId,
            selectedFolderId,
          );
          if (!result.success) {
            errorToast({ message: result.error || 'Failed to move file' });
            return;
          }
        } else {
          const result = await moveFolder(
            singleProps.resourceId,
            selectedFolderId,
          );
          if (!result.success) {
            errorToast({ message: result.error || 'Failed to move folder' });
            return;
          }
        }
        successToast({ message: `Moved "${singleProps.resourceName}"` });
        singleProps.onMoved();
        onClose();
      }
    } catch {
      errorToast({ message: 'Failed to move' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const folderTree = buildFolderTree(folders);

  const isDisabled = (folderId: string): boolean => {
    if (isBulk) {
      return false;
    }
    const singleProps = props as SingleModeProps;
    // Can't move a folder into itself or its descendants
    if (
      singleProps.resourceType === 'folder' &&
      folderId === singleProps.resourceId
    ) {
      return true;
    }
    // Check if target is a descendant of the folder being moved
    if (singleProps.resourceType === 'folder') {
      const folder = folders.find((f) => f.id === folderId);
      if (folder?.path.includes(`/${singleProps.resourceId}/`)) {
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
    const currentFolderId = isBulk
      ? undefined
      : (props as SingleModeProps).currentFolderId;
    const isCurrent = folder.id === currentFolderId;

    return (
      <div key={folder.id}>
        <button
          type="button"
          disabled={disabled}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${(() => {
            if (disabled) {
              return 'text-muted-foreground cursor-not-allowed';
            }
            if (isSelected) {
              return 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300';
            }
            return 'text-foreground hover:bg-muted';
          })()}`}
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
              className="text-muted-foreground"
            >
              {isExpanded ? '▾' : '▸'}
            </span>
          )}
          {!hasChildren && <span className="w-3" />}
          <span>📁</span>
          <span className="truncate">{folder.name}</span>
          {isCurrent && (
            <span className="text-xs text-muted-foreground">(current)</span>
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
      <DialogTitle>
        {isBulk
          ? `Move ${(props as BulkModeProps).fileIds.length} files`
          : `Move "${(props as SingleModeProps).resourceName}"`}
      </DialogTitle>
      <p className="text-sm text-muted-foreground mt-1">
        {isBulk
          ? 'Select a destination folder for the selected files.'
          : `Change the location of your ${(props as SingleModeProps).resourceType}.`}
      </p>

      <div className="mt-4 max-h-80 overflow-y-auto border rounded-md dark:border-border">
        {/* Root level (All files) */}
        <button
          type="button"
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${
            selectedFolderId === null
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
              : 'text-foreground hover:bg-muted'
          }`}
          onClick={() => setSelectedFolderId(null)}
        >
          <span>📁</span>
          <span className="font-medium">All Files</span>
          {!isBulk && (props as SingleModeProps).currentFolderId === null && (
            <span className="text-xs text-muted-foreground">(current)</span>
          )}
        </button>

        {folderTree.map((folder) => renderFolder(folder))}
      </div>

      <div className="flex justify-end space-x-2 mt-6">
        <Button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="bg-paper-200 text-foreground hover:bg-paper-300 dark:bg-paper-700 dark:hover:bg-paper-600"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleMove}
          disabled={
            isSubmitting ||
            (!isBulk &&
              selectedFolderId ===
                ((props as SingleModeProps).currentFolderId ?? null))
          }
        >
          {isSubmitting ? 'Moving...' : 'Move'}
        </Button>
      </div>
    </Dialog>
  );
}
