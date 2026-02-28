'use client';

import { useState, useCallback, useEffect } from 'react';
import { statusToast } from '@/app/lib/utils/toast';
import { getFolders, deleteFolder } from '@/app/actions/folders';
import { getTeams } from '@/app/actions/teams';
import { CreateFolderDialog } from './CreateFolderDialog';
import type { DocumentFolderItem } from '@/features/documents/contracts/document.types';
import type { TeamListItem } from '@/features/teams/contracts/team.types';

type Props = {
  initialFolders: DocumentFolderItem[];
  canManage: boolean;
  onSelectFolder?: (folderId: string | null) => void;
  selectedFolderId?: string | null;
};

export function FoldersList({
  initialFolders,
  canManage,
  onSelectFolder,
  selectedFolderId,
}: Props) {
  const { successToast, errorToast } = statusToast();
  const [folders, setFolders] = useState(initialFolders);
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  useEffect(() => {
    getTeams()
      .then(setTeams)
      .catch(() => {});
  }, []);

  const refreshFolders = useCallback(async () => {
    const updated = await getFolders();
    setFolders(updated);
  }, []);

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      if (
        !confirm('Delete this folder? Files will be moved out of the folder.')
      ) {
        return;
      }

      const result = await deleteFolder(folderId);
      if (result.success) {
        successToast({ message: 'Folder deleted' });
        refreshFolders();
        if (selectedFolderId === folderId) {
          onSelectFolder?.(null);
        }
      } else {
        errorToast({ message: result.error || 'Failed to delete folder' });
      }
    },
    [
      successToast,
      errorToast,
      refreshFolders,
      selectedFolderId,
      onSelectFolder,
    ],
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
          Folders
        </h3>
        {canManage && (
          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="text-sm text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            + New
          </button>
        )}
      </div>

      {/* All files option */}
      <button
        onClick={() => onSelectFolder?.(null)}
        className={`w-full text-left px-3 py-2 rounded-md text-sm ${
          selectedFolderId === null
            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
        }`}
      >
        All Files
      </button>

      {/* Folder items */}
      {folders.map((folder) => (
        <button
          key={folder.id}
          type="button"
          className={`group w-full flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer ${
            selectedFolderId === folder.id
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
          }`}
          onClick={() => onSelectFolder?.(folder.id)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate">{folder.name}</span>
            {folder.teamName && (
              <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {folder.teamName}
              </span>
            )}
            <span className="shrink-0 text-xs text-gray-400">
              {folder.fileCount}
            </span>
          </div>
          {canManage && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(folder.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDeleteFolder(folder.id);
                }
              }}
              className="hidden group-hover:block text-red-500 hover:text-red-600 text-xs"
            >
              Delete
            </span>
          )}
        </button>
      ))}

      <CreateFolderDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        onCreated={refreshFolders}
      />
    </div>
  );
}
