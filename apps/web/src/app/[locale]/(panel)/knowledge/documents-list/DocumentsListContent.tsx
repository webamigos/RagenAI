'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { FileListWrapperWithData } from '@/app/components/ManageKnowledge/UserFiles/UserFilesWrapper';
import {
  FoldersList,
  type ScopeCounts,
  type ViewMode,
} from '@/app/components/ManageKnowledge/Folders/FoldersList';
import { Breadcrumbs } from '@/app/components/ManageKnowledge/Breadcrumbs';
import { useUserFilesContext } from '@/app/hooks/useUserFilesContext';
import { useOrganization } from '@/app/hooks/use-auth';
import { getFolders } from '@/app/actions/folders';
import { getKnowledgeBaseUsage, type KnowledgeBaseUsage } from '../actions';
import { useRouter, usePathname } from '@/i18n/routing';
import type {
  PaginatedUserFilesResult,
  UserFilesSort,
  UserFilesSortDir,
  DocumentFolderItem,
} from '@/features/documents/contracts/document.types';
import type {
  FileType,
  EmbeddingStatus,
  PiiPolicy,
} from '@/generated/prisma/browser';
import type { KbViewMode } from '@/context/FilesContext';

type Props = {
  result: PaginatedUserFilesResult;
  scopeCounts: Record<ViewMode, number>;
  sort: UserFilesSort;
  dir: UserFilesSortDir;
  selectedFileTypes: FileType[];
  selectedStatuses: EmbeddingStatus[];
  selectedPolicies: PiiPolicy[];
  folderId?: string | null;
  viewMode?: KbViewMode;
};

/** Which scope the rail has active, and therefore what the page is titled. */
const SCOPE_LABEL_KEY: Record<ViewMode, string> = {
  all: 'all-files',
  'my-files': 'my-files',
  'shared-with-me': 'shared-with-me',
};

export function DocumentsListContent({
  result,
  scopeCounts,
  sort,
  dir,
  selectedFileTypes,
  selectedStatuses,
  selectedPolicies,
  folderId,
  viewMode: viewModeProp,
}: Props) {
  const { currentFolderId, viewMode, setFolder, setViewMode } =
    useUserFilesContext();
  const { canManageOrg } = useOrganization();
  const tFolders = useTranslations('folders');

  useEffect(() => {
    const incoming = folderId ?? null;
    if (incoming !== currentFolderId) {
      setFolder(incoming);
    }
  }, [folderId, currentFolderId, setFolder]);

  useEffect(() => {
    const incoming = viewModeProp ?? 'all';
    if (incoming !== viewMode) {
      setViewMode(incoming);
    }
  }, [viewModeProp, viewMode, setViewMode]);

  const router = useRouter();
  const pathname = usePathname();
  const [folders, setFolders] = useState<DocumentFolderItem[]>([]);
  const [usage, setUsage] = useState<KnowledgeBaseUsage | null>(null);

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
      const effectiveMode = mode ?? viewMode;
      const params = new URLSearchParams(
        typeof window !== 'undefined' ? window.location.search : '',
      );
      if (folderId) {
        params.set('folderId', folderId);
      } else {
        params.delete('folderId');
      }
      params.set('viewMode', effectiveMode);
      params.set('page', '1');
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [setFolder, setViewMode, viewMode, router, pathname],
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
    // flex-1 + min-h-0 claims the panel's full height from the shell, which
    // stretches its children. Without min-h-0 the folder column's
    // overflow-y-auto never scrolls: a flex item's default min-height is
    // auto, so it grows to its content instead of clipping.
    <div className="flex min-h-0 flex-1 gap-3 pb-5">
      {/* 216px, per phase 7. Its own scroll area: the usage block is pinned to
          the bottom of the rail and must not scroll away with the folders. */}
      <div className="hidden w-[216px] shrink-0 border-r border-border pr-2 lg:block">
        <FoldersList
          initialFolders={folders}
          onSelectFolder={handleSelectFolder}
          selectedFolderId={currentFolderId}
          selectedViewMode={viewMode}
          usage={usage}
          scopeCounts={scopeCounts}
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
          selectedPolicies={selectedPolicies}
          canManageOrg={canManageOrg}
          heading={
            <div className="min-w-0">
              <h1 className="truncate font-display text-xl font-semibold text-foreground">
                {tFolders(SCOPE_LABEL_KEY[viewMode])}
              </h1>
              {/*
                The scope's own total, not the table's. The table already says
                how many rows a filter left ("1-25 of 240" under it), so
                repeating that here would leave the title describing the filter
                rather than the place.
              */}
              <p className="text-xs text-muted-foreground">
                {tFolders('document-count', {
                  count: scopeCounts[viewMode] ?? 0,
                })}
              </p>
            </div>
          }
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
