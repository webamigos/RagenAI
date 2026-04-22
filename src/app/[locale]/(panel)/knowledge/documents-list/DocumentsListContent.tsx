'use client';

import { useEffect, useState, useCallback } from 'react';
import { FileListWrapper } from '@/app/components/ManageKnowledge/UserFiles/UserFilesWrapper';
import {
  FoldersList,
  type ViewMode,
} from '@/app/components/ManageKnowledge/Folders/FoldersList';
import { Breadcrumbs } from '@/app/components/ManageKnowledge/Breadcrumbs';
import { useUserFilesContext } from '@/app/hooks/useUserFilesContext';
import { getFolders } from '@/app/actions/folders';
import { getKnowledgeBaseUsage } from '../actions';
import type { DocumentFolderItem } from '@/features/documents/contracts/document.types';

export function DocumentsListContent() {
  const { currentFolderId, viewMode, setFolder, setViewMode, refreshFiles } =
    useUserFilesContext();
  const [folders, setFolders] = useState<DocumentFolderItem[]>([]);
  const [usage, setUsage] = useState<{
    storageBytes: number;
    pageCount: number;
  } | null>(null);

  const loadFolders = useCallback(async () => {
    try {
      const result = await getFolders();
      setFolders(result);
    } catch {
      // Folders are optional, don't block the page
    }
  }, []);

  useEffect(() => {
    loadFolders();
    getKnowledgeBaseUsage()
      .then(setUsage)
      .catch(() => {
        // Usage is non-critical, don't block the page
      });
  }, [loadFolders]);

  const handleFolderMutated = useCallback(() => {
    loadFolders();
    refreshFiles();
  }, [loadFolders, refreshFiles]);

  const handleSelectFolder = (folderId: string | null, mode?: ViewMode) => {
    setFolder(folderId);
    if (mode) {
      setViewMode(mode);
    }
  };

  const handleBreadcrumbNavigate = (folderId: string | null) => {
    setFolder(folderId);
  };

  return (
    <div className="flex gap-3 pb-5">
      {/* Folder sidebar */}
      <div className="hidden lg:block w-56 shrink-0 overflow-y-auto border-r border-gray-200 dark:border-gray-700 pr-2">
        <FoldersList
          initialFolders={folders}
          onSelectFolder={handleSelectFolder}
          selectedFolderId={currentFolderId}
          selectedViewMode={viewMode}
          usage={usage}
          onFolderMutated={handleFolderMutated}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <FileListWrapper
          topBarLeft={
            <Breadcrumbs
              folderId={currentFolderId}
              viewMode={viewMode}
              onNavigate={handleBreadcrumbNavigate}
            />
          }
        />
      </div>
    </div>
  );
}
