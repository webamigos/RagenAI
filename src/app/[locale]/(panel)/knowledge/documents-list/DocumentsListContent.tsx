'use client';

import { useEffect, useState, useCallback } from 'react';
import { FileListWrapperWithData } from '@/app/components/ManageKnowledge/UserFiles/UserFilesWrapper';
import {
  FoldersList,
  type ViewMode,
} from '@/app/components/ManageKnowledge/Folders/FoldersList';
import { Breadcrumbs } from '@/app/components/ManageKnowledge/Breadcrumbs';
import { useUserFilesContext } from '@/app/hooks/useUserFilesContext';
import { getFolders } from '@/app/actions/folders';
import { getKnowledgeBaseUsage } from '../actions';
import { useRouter, usePathname } from '@/i18n/routing';
import type {
  PaginatedUserFilesResult,
  UserFilesSort,
  UserFilesSortDir,
  DocumentFolderItem,
} from '@/features/documents/contracts/document.types';
import type { FileType, EmbeddingStatus } from '@/generated/prisma/browser';

type Props = {
  result: PaginatedUserFilesResult;
  sort: UserFilesSort;
  dir: UserFilesSortDir;
  selectedFileTypes: FileType[];
  selectedStatuses: EmbeddingStatus[];
};

export function DocumentsListContent({
  result,
  sort,
  dir,
  selectedFileTypes,
  selectedStatuses,
}: Props) {
  const { currentFolderId, viewMode, setFolder, setViewMode } =
    useUserFilesContext();
  const router = useRouter();
  const pathname = usePathname();
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
    router.refresh();
  }, [loadFolders, router]);

  const handleSelectFolder = useCallback(
    (folderId: string | null, mode?: ViewMode) => {
      setFolder(folderId);
      if (mode) {
        setViewMode(mode);
      }
      const params = new URLSearchParams(
        typeof window !== 'undefined' ? window.location.search : '',
      );
      if (folderId) {
        params.set('folderId', folderId);
      } else {
        params.delete('folderId');
      }
      params.set('page', '1');
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [setFolder, setViewMode, router, pathname],
  );

  const handleBreadcrumbNavigate = useCallback(
    (folderId: string | null) => {
      setFolder(folderId);
      const params = new URLSearchParams(
        typeof window !== 'undefined' ? window.location.search : '',
      );
      if (folderId) {
        params.set('folderId', folderId);
      } else {
        params.delete('folderId');
      }
      params.set('page', '1');
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [setFolder, router, pathname],
  );

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
        <FileListWrapperWithData
          result={result}
          sort={sort}
          dir={dir}
          selectedFileTypes={selectedFileTypes}
          selectedStatuses={selectedStatuses}
          topBarLeft={
            <Breadcrumbs
              folderId={currentFolderId}
              onNavigate={handleBreadcrumbNavigate}
            />
          }
        />
      </div>
    </div>
  );
}
