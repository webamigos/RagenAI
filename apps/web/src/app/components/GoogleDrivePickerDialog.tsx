'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  MagnifyingGlassIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CheckboxGlyph } from '@ragenai/common-ui/CheckboxGlyph';
import { Button } from '@/components/ui/button';
import {
  searchDriveFiles,
  searchDriveFolders,
  getDriveFileContent,
  listDriveFolderFiles,
} from '@/app/actions/google-drive';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';

type DriveFile = {
  id: string;
  name: string;
  mime_type: string;
  modified_time: string;
  owner: string;
  web_view_link?: string;
};

type FolderBreadcrumb = {
  id: string;
  name: string;
};

type CachedView = {
  files: DriveFile[];
  nextPageToken?: string;
  batchCount: number;
  search: string;
  showFolders: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelected: (doc: ThreadDocumentUI) => void;
};

const MAX_BATCHES = 5;
const CONCURRENT_LIMIT = 5;
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export const GoogleDrivePickerDialog = ({
  open,
  onOpenChange,
  onFileSelected,
}: Props) => {
  const t = useTranslations('drive-picker');
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [batchCount, setBatchCount] = useState(1);
  const [showFolders, setShowFolders] = useState(false);
  const [folderStack, setFolderStack] = useState<FolderBreadcrumb[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const [isAttaching, setIsAttaching] = useState(false);
  const [attachProgress, setAttachProgress] = useState({
    current: 0,
    total: 0,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Cache root-level results so navigating back doesn't re-fetch
  const rootCacheRef = useRef<CachedView | null>(null);

  const insideFolder = folderStack.length > 0;

  // Fetch root-level items (files or folders based on toggle)
  const loadRootItems = useCallback(
    async (query: string, foldersMode: boolean) => {
      setIsLoading(true);
      setError(null);
      setNextPageToken(undefined);
      setBatchCount(1);
      try {
        const result = foldersMode
          ? await searchDriveFolders(query)
          : await searchDriveFiles(query);
        if (result.success && result.files) {
          setFiles(result.files);
          setNextPageToken(result.next_page_token);
          // Cache the results
          rootCacheRef.current = {
            files: result.files,
            nextPageToken: result.next_page_token,
            batchCount: 1,
            search: query,
            showFolders: foldersMode,
          };
        } else {
          setFiles([]);
          if (result.error) {
            setError(result.error);
          }
        }
      } catch {
        setFiles([]);
        setError(t('fetch-error'));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  // Fetch files inside a folder
  const loadFolderFiles = useCallback(
    async (folderId: string) => {
      setIsLoading(true);
      setError(null);
      setNextPageToken(undefined);
      setBatchCount(1);
      setSelectedFileIds(new Set());
      try {
        const result = await listDriveFolderFiles(folderId);
        if (result.success && result.files) {
          setFiles(result.files);
          // Auto-select only non-folder files
          setSelectedFileIds(
            new Set(
              result.files
                .filter((f) => f.mime_type !== FOLDER_MIME_TYPE)
                .map((f) => f.id),
            ),
          );
          setNextPageToken(result.nextPageToken);
        } else {
          setFiles([]);
          if (result.error) {
            setError(result.error);
          }
        }
      } catch {
        setFiles([]);
        setError(t('fetch-error'));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  const loadMore = useCallback(async () => {
    if (!nextPageToken || isLoadingMore || batchCount >= MAX_BATCHES) {
      return;
    }
    setIsLoadingMore(true);
    try {
      if (insideFolder) {
        const currentFolder = folderStack[folderStack.length - 1];
        const result = await listDriveFolderFiles(
          currentFolder.id,
          nextPageToken,
        );
        if (result.success && result.files) {
          setFiles((prev) => [...prev, ...result.files!]);
          setSelectedFileIds((prev) => {
            const next = new Set(prev);
            for (const f of result.files!) {
              if (f.mime_type !== FOLDER_MIME_TYPE) {
                next.add(f.id);
              }
            }
            return next;
          });
          setNextPageToken(result.nextPageToken);
          setBatchCount((prev) => prev + 1);
        }
      } else {
        const result = showFolders
          ? await searchDriveFolders(search, nextPageToken)
          : await searchDriveFiles(search, nextPageToken);
        if (result.success && result.files) {
          setFiles((prev) => [...prev, ...result.files!]);
          setNextPageToken(result.next_page_token);
          setBatchCount((prev) => prev + 1);
          // Update cache
          if (rootCacheRef.current) {
            rootCacheRef.current.files = [
              ...rootCacheRef.current.files,
              ...result.files!,
            ];
            rootCacheRef.current.nextPageToken = result.next_page_token;
            rootCacheRef.current.batchCount += 1;
          }
        }
      }
    } catch {
      // Silently fail on load-more
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    nextPageToken,
    isLoadingMore,
    batchCount,
    search,
    showFolders,
    insideFolder,
    folderStack,
  ]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextPageToken || batchCount >= MAX_BATCHES) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextPageToken, batchCount, loadMore]);

  // Reset on dialog open
  useEffect(() => {
    if (open) {
      setSearch('');
      setFiles([]);
      setError(null);
      setNextPageToken(undefined);
      setBatchCount(1);
      setShowFolders(false);
      setFolderStack([]);
      setSelectedFileIds(new Set());
      rootCacheRef.current = null;
      loadRootItems('', false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when showFolders changes (only at root level)
  useEffect(() => {
    if (open && !insideFolder) {
      setSearch('');
      rootCacheRef.current = null;
      loadRootItems('', showFolders);
    }
  }, [showFolders]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (value: string) => {
    setSearch(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      rootCacheRef.current = null;
      loadRootItems(value, showFolders);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleItemClick = async (file: DriveFile) => {
    // If it's a folder, navigate into it
    if (file.mime_type === FOLDER_MIME_TYPE) {
      setFolderStack((prev) => [...prev, { id: file.id, name: file.name }]);
      setSearch('');
      loadFolderFiles(file.id);
      return;
    }

    // If inside a folder, toggle selection instead of immediate attach
    if (insideFolder) {
      toggleFileSelection(file.id);
      return;
    }

    // At root level, clicking a file attaches it directly
    setLoadingFileId(file.id);
    try {
      const result = await getDriveFileContent(file.id);
      if (result.success && result.content) {
        const doc: ThreadDocumentUI = {
          name: file.name,
          content: result.content,
          size: new Blob([result.content]).size,
          type: file.mime_type || 'text/plain',
          sourceUrl: file.web_view_link,
          driveFileId: file.id,
          driveModifiedTime: file.modified_time,
        };
        onFileSelected(doc);
        onOpenChange(false);
      } else {
        setError(result.error || t('fetch-error'));
      }
    } catch {
      setError(t('fetch-error'));
    } finally {
      setLoadingFileId(null);
    }
  };

  const handleBackToParent = () => {
    const newStack = folderStack.slice(0, -1);
    setFolderStack(newStack);
    setSelectedFileIds(new Set());
    setError(null);

    if (newStack.length === 0) {
      // Restore cached root view instead of re-fetching
      if (rootCacheRef.current) {
        setFiles(rootCacheRef.current.files);
        setNextPageToken(rootCacheRef.current.nextPageToken);
        setBatchCount(rootCacheRef.current.batchCount);
        setSearch(rootCacheRef.current.search);
      } else {
        loadRootItems(search, showFolders);
      }
    } else {
      // Back to parent folder
      loadFolderFiles(newStack[newStack.length - 1].id);
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = files.filter((f) => f.mime_type !== FOLDER_MIME_TYPE);
    if (selectedFileIds.size === selectable.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(selectable.map((f) => f.id)));
    }
  };

  const handleAttachSelected = async () => {
    const selectedFiles = files.filter((f) => selectedFileIds.has(f.id));
    if (selectedFiles.length === 0) {
      return;
    }

    setIsAttaching(true);
    setAttachProgress({ current: 0, total: selectedFiles.length });

    const docs: ThreadDocumentUI[] = [];

    for (let i = 0; i < selectedFiles.length; i += CONCURRENT_LIMIT) {
      const batch = selectedFiles.slice(i, i + CONCURRENT_LIMIT);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const result = await getDriveFileContent(file.id);
          if (result.success && result.content) {
            return {
              name: file.name,
              content: result.content,
              size: new Blob([result.content]).size,
              type: file.mime_type || 'text/plain',
              sourceUrl: file.web_view_link,
              driveFileId: file.id,
              driveModifiedTime: file.modified_time,
            } satisfies ThreadDocumentUI;
          }
          return null;
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          docs.push(result.value);
        }
      }
      setAttachProgress({
        current: Math.min(i + CONCURRENT_LIMIT, selectedFiles.length),
        total: selectedFiles.length,
      });
    }

    if (docs.length > 0) {
      for (const doc of docs) {
        onFileSelected(doc);
      }
      setIsAttaching(false);
      onOpenChange(false);
    } else {
      setIsAttaching(false);
      setError(t('fetch-error'));
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) {
      return '';
    }
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const hasMorePages = !!nextPageToken;
  const reachedBatchLimit = batchCount >= MAX_BATCHES && hasMorePages;
  const selectableFiles = files.filter((f) => f.mime_type !== FOLDER_MIME_TYPE);
  const allSelected =
    selectableFiles.length > 0 &&
    selectedFileIds.size === selectableFiles.length;
  const currentFolderName =
    folderStack.length > 0 ? folderStack[folderStack.length - 1].name : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {insideFolder ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBackToParent}
                  className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <ArrowLeftIcon className="size-4" />
                </button>
                <span className="truncate">{currentFolderName}</span>
              </div>
            ) : (
              t('title')
            )}
          </DialogTitle>
        </DialogHeader>

        {!insideFolder && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={t('search-placeholder')}
                className="pl-9"
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFolders((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors shrink-0"
            >
              <CheckboxGlyph checked={showFolders} />
              {t('show-folders')}
            </button>
          </div>
        )}

        {error && <div className="text-sm text-red-500 px-1">{error}</div>}

        <div ref={scrollContainerRef} className="h-96 overflow-y-auto -mx-1">
          {(() => {
            if (isLoading) {
              return (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-400" />
                </div>
              );
            }
            if (files.length === 0) {
              return (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {search ? t('no-results') : t('no-files')}
                </div>
              );
            }
            return (
              <div className="flex flex-col gap-0.5">
                {insideFolder && selectableFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="flex items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <CheckboxGlyph checked={allSelected} />
                    <span>
                      {allSelected ? t('deselect-all') : t('select-all')}
                    </span>
                    <span className="ml-auto">
                      {selectedFileIds.size}/{selectableFiles.length}
                    </span>
                  </button>
                )}

                {files.map((file) => {
                  const isFolder = file.mime_type === FOLDER_MIME_TYPE;
                  const isFileLoading = loadingFileId === file.id;

                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => handleItemClick(file)}
                      disabled={loadingFileId !== null || isAttaching}
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {insideFolder && !isFolder && (
                        <CheckboxGlyph checked={selectedFileIds.has(file.id)} />
                      )}
                      {(() => {
                        if (isFileLoading) {
                          return (
                            <div className="size-5 shrink-0 flex items-center justify-center">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-zinc-400" />
                            </div>
                          );
                        }
                        if (isFolder) {
                          return (
                            <img
                              src="/assets/connectors/google-drive.svg"
                              alt="Folder"
                              className="size-5 shrink-0"
                            />
                          );
                        }
                        return (
                          <img
                            src="/assets/connectors/google-docs.svg"
                            alt="Google Doc"
                            className="size-5 shrink-0"
                          />
                        );
                      })()}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{file.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(file.modified_time)}
                          {file.owner && (
                            <span className="ml-2">{file.owner}</span>
                          )}
                        </div>
                      </div>
                      {isFolder && (
                        <span className="text-xs text-muted-foreground">→</span>
                      )}
                    </button>
                  );
                })}

                {hasMorePages && !reachedBatchLimit && (
                  <div ref={sentinelRef} className="py-2">
                    {isLoadingMore && (
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-zinc-400" />
                      </div>
                    )}
                  </div>
                )}

                {reachedBatchLimit && (
                  <div className="text-center py-3 text-xs text-muted-foreground">
                    {t('use-search-hint')}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {insideFolder && selectableFiles.length > 0 && (
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleAttachSelected}
              disabled={selectedFileIds.size === 0 || isAttaching}
              size="sm"
            >
              {isAttaching
                ? t('attach-progress', {
                    current: attachProgress.current,
                    total: attachProgress.total,
                  })
                : t('attach-selected', { count: selectedFileIds.size })}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
