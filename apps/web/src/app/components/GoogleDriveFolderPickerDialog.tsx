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
  searchDriveFolders,
  listDriveFolderFiles,
  getDriveFileContent,
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

type DriveFolder = {
  id: string;
  name: string;
  modified_time: string;
  owner: string;
};

type Step = 'folders' | 'files';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilesSelected?: (docs: ThreadDocumentUI[]) => void;
  mode?: 'attach' | 'import';
  onFolderSelected?: (folderId: string, folderName: string) => void;
};

const MAX_BATCHES = 5;
const CONCURRENT_LIMIT = 5;

export const GoogleDriveFolderPickerDialog = ({
  open,
  onOpenChange,
  onFilesSelected,
  mode = 'attach',
  onFolderSelected,
}: Props) => {
  const t = useTranslations('drive-folder-picker');
  const [step, setStep] = useState<Step>('folders');

  // Folder search state
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [isFoldersLoading, setIsFoldersLoading] = useState(false);
  const [folderSearch, setFolderSearch] = useState('');
  const [folderNextPageToken, setFolderNextPageToken] = useState<
    string | undefined
  >();
  const [folderBatchCount, setFolderBatchCount] = useState(1);
  const [isFolderLoadingMore, setIsFolderLoadingMore] = useState(false);

  // File selection state
  const [selectedFolder, setSelectedFolder] = useState<DriveFolder | null>(
    null,
  );
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const [fileNextPageToken, setFileNextPageToken] = useState<
    string | undefined
  >();
  const [fileBatchCount, setFileBatchCount] = useState(1);
  const [isFileLoadingMore, setIsFileLoadingMore] = useState(false);

  // Attach progress
  const [isAttaching, setIsAttaching] = useState(false);
  const [attachProgress, setAttachProgress] = useState({
    current: 0,
    total: 0,
  });

  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const folderSentinelRef = useRef<HTMLDivElement | null>(null);
  const fileSentinelRef = useRef<HTMLDivElement | null>(null);
  const folderScrollRef = useRef<HTMLDivElement | null>(null);
  const fileScrollRef = useRef<HTMLDivElement | null>(null);

  const loadFolders = useCallback(
    async (query: string = '') => {
      setIsFoldersLoading(true);
      setError(null);
      setFolderNextPageToken(undefined);
      setFolderBatchCount(1);
      try {
        const result = await searchDriveFolders(query);
        if (result.success && result.files) {
          setFolders(result.files);
          setFolderNextPageToken(result.next_page_token);
        } else {
          setFolders([]);
          if (result.error) {
            setError(result.error);
          }
        }
      } catch {
        setFolders([]);
        setError(t('fetch-error'));
      } finally {
        setIsFoldersLoading(false);
      }
    },
    [t],
  );

  const loadMoreFolders = useCallback(async () => {
    if (
      !folderNextPageToken ||
      isFolderLoadingMore ||
      folderBatchCount >= MAX_BATCHES
    ) {
      return;
    }
    setIsFolderLoadingMore(true);
    try {
      const result = await searchDriveFolders(
        folderSearch,
        folderNextPageToken,
      );
      if (result.success && result.files) {
        setFolders((prev) => [...prev, ...result.files!]);
        setFolderNextPageToken(result.next_page_token);
        setFolderBatchCount((prev) => prev + 1);
      }
    } catch {
      // Silently fail on load-more
    } finally {
      setIsFolderLoadingMore(false);
    }
  }, [
    folderNextPageToken,
    isFolderLoadingMore,
    folderBatchCount,
    folderSearch,
  ]);

  const loadFolderFiles = useCallback(
    async (folderId: string) => {
      setIsFilesLoading(true);
      setError(null);
      setFileNextPageToken(undefined);
      setFileBatchCount(1);
      try {
        const result = await listDriveFolderFiles(folderId);
        if (result.success && result.files) {
          setFiles(result.files);
          setSelectedFileIds(new Set(result.files.map((f) => f.id)));
          setFileNextPageToken(result.nextPageToken);
        } else {
          setFiles([]);
          setSelectedFileIds(new Set());
          if (result.error) {
            setError(result.error);
          }
        }
      } catch {
        setFiles([]);
        setSelectedFileIds(new Set());
        setError(t('fetch-error'));
      } finally {
        setIsFilesLoading(false);
      }
    },
    [t],
  );

  const loadMoreFiles = useCallback(async () => {
    if (
      !fileNextPageToken ||
      isFileLoadingMore ||
      fileBatchCount >= MAX_BATCHES ||
      !selectedFolder
    ) {
      return;
    }
    setIsFileLoadingMore(true);
    try {
      const result = await listDriveFolderFiles(
        selectedFolder.id,
        fileNextPageToken,
      );
      if (result.success && result.files) {
        setFiles((prev) => [...prev, ...result.files!]);
        setSelectedFileIds((prev) => {
          const next = new Set(prev);
          for (const f of result.files!) {
            next.add(f.id);
          }
          return next;
        });
        setFileNextPageToken(result.nextPageToken);
        setFileBatchCount((prev) => prev + 1);
      }
    } catch {
      // Silently fail on load-more
    } finally {
      setIsFileLoadingMore(false);
    }
  }, [fileNextPageToken, isFileLoadingMore, fileBatchCount, selectedFolder]);

  // Intersection observers
  useEffect(() => {
    const sentinel = folderSentinelRef.current;
    if (
      !sentinel ||
      !folderNextPageToken ||
      folderBatchCount >= MAX_BATCHES ||
      step !== 'folders'
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreFolders();
        }
      },
      { root: folderScrollRef.current, threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [folderNextPageToken, folderBatchCount, loadMoreFolders, step]);

  useEffect(() => {
    const sentinel = fileSentinelRef.current;
    if (
      !sentinel ||
      !fileNextPageToken ||
      fileBatchCount >= MAX_BATCHES ||
      step !== 'files'
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreFiles();
        }
      },
      { root: fileScrollRef.current, threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fileNextPageToken, fileBatchCount, loadMoreFiles, step]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep('folders');
      setFolderSearch('');
      setFolders([]);
      setFiles([]);
      setSelectedFileIds(new Set());
      setSelectedFolder(null);
      setError(null);
      loadFolders();
    }
  }, [open, loadFolders]);

  // Debounced folder search
  const handleFolderSearchChange = (value: string) => {
    setFolderSearch(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      loadFolders(value);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleFolderClick = (folder: DriveFolder) => {
    setSelectedFolder(folder);
    setStep('files');
    loadFolderFiles(folder.id);
  };

  const handleBackToFolders = () => {
    setStep('folders');
    setFiles([]);
    setSelectedFileIds(new Set());
    setError(null);
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
    if (selectedFileIds.size === files.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(files.map((f) => f.id)));
    }
  };

  const handleAttachSelected = async () => {
    if (mode === 'import' && selectedFolder && onFolderSelected) {
      onFolderSelected(selectedFolder.id, selectedFolder.name);
      onOpenChange(false);
      return;
    }

    const selectedFiles = files.filter((f) => selectedFileIds.has(f.id));
    if (selectedFiles.length === 0) {
      return;
    }

    setIsAttaching(true);
    setAttachProgress({ current: 0, total: selectedFiles.length });

    const docs: ThreadDocumentUI[] = [];

    // Process in batches of CONCURRENT_LIMIT
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

    if (docs.length > 0 && onFilesSelected) {
      onFilesSelected(docs);
    }
    setIsAttaching(false);
    onOpenChange(false);
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

  const allSelected = files.length > 0 && selectedFileIds.size === files.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'folders' ? (
              t('title')
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBackToFolders}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <ArrowLeftIcon className="size-4" />
                </button>
                <span className="truncate">
                  {selectedFolder?.name ?? t('select-files-title')}
                </span>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {step === 'folders' && (
          <>
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={folderSearch}
                onChange={(e) => handleFolderSearchChange(e.target.value)}
                placeholder={t('search-placeholder')}
                className="pl-9"
                autoFocus
              />
            </div>

            {error && <div className="text-sm text-destructive px-1">{error}</div>}

            <div
              ref={folderScrollRef}
              className="max-h-72 overflow-y-auto -mx-1"
            >
              {(() => {
                if (isFoldersLoading) {
                  return (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-border" />
                    </div>
                  );
                }
                if (folders.length === 0) {
                  return (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      {folderSearch ? t('no-results') : t('no-folders')}
                    </div>
                  );
                }
                return (
                  <div className="flex flex-col gap-0.5">
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => handleFolderClick(folder)}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors hover:bg-muted"
                      >
                        <img
                          src="/assets/connectors/google-drive.svg"
                          alt="Folder"
                          className="size-5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{folder.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(folder.modified_time)}
                            {folder.owner && (
                              <span className="ml-2">{folder.owner}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}

                    {!!folderNextPageToken &&
                      folderBatchCount < MAX_BATCHES && (
                        <div ref={folderSentinelRef} className="py-2">
                          {isFolderLoadingMore && (
                            <div className="flex justify-center">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-border" />
                            </div>
                          )}
                        </div>
                      )}

                    {folderBatchCount >= MAX_BATCHES &&
                      !!folderNextPageToken && (
                        <div className="text-center py-3 text-xs text-muted-foreground">
                          {t('use-search-hint')}
                        </div>
                      )}
                  </div>
                );
              })()}
            </div>
          </>
        )}

        {step === 'files' && (
          <>
            {error && <div className="text-sm text-destructive px-1">{error}</div>}

            <div ref={fileScrollRef} className="max-h-72 overflow-y-auto -mx-1">
              {(() => {
                if (isFilesLoading) {
                  return (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-border" />
                    </div>
                  );
                }
                if (files.length === 0) {
                  return (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      {t('no-files')}
                    </div>
                  );
                }
                return (
                  <div className="flex flex-col gap-0.5">
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
                        {selectedFileIds.size}/{files.length}
                      </span>
                    </button>

                    {files.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => toggleFileSelection(file.id)}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors hover:bg-muted"
                      >
                        <CheckboxGlyph checked={selectedFileIds.has(file.id)} />
                        <img
                          src="/assets/connectors/google-docs.svg"
                          alt="File"
                          className="size-5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{file.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(file.modified_time)}
                            {file.owner && (
                              <span className="ml-2">{file.owner}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}

                    {!!fileNextPageToken && fileBatchCount < MAX_BATCHES && (
                      <div ref={fileSentinelRef} className="py-2">
                        {isFileLoadingMore && (
                          <div className="flex justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-border" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleAttachSelected}
                disabled={
                  isAttaching ||
                  (mode === 'import'
                    ? !selectedFolder
                    : selectedFileIds.size === 0)
                }
                size="sm"
              >
                {(() => {
                  if (isAttaching) {
                    return t('progress', {
                      current: attachProgress.current,
                      total: attachProgress.total,
                    });
                  }
                  if (mode === 'import') {
                    return t('import-selected');
                  }
                  return t('attach-selected');
                })()}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
