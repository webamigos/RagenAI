'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  searchDriveFiles,
  getDriveFileContent,
} from '@/app/actions/google-drive';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';

type DriveFile = {
  id: string;
  name: string;
  mime_type: string;
  modified_time: string;
  owner: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelected: (doc: ThreadDocumentUI) => void;
};

const MAX_BATCHES = 5;

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadFiles = useCallback(
    async (query: string = '') => {
      setIsLoading(true);
      setError(null);
      setNextPageToken(undefined);
      setBatchCount(1);
      try {
        const result = await searchDriveFiles(query);
        if (result.success && result.files) {
          setFiles(result.files);
          setNextPageToken(result.next_page_token);
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
      const result = await searchDriveFiles(search, nextPageToken);
      if (result.success && result.files) {
        setFiles((prev) => [...prev, ...result.files!]);
        setNextPageToken(result.next_page_token);
        setBatchCount((prev) => prev + 1);
      }
    } catch {
      // Silently fail on load-more
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextPageToken, isLoadingMore, batchCount, search]);

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

  useEffect(() => {
    if (open) {
      setSearch('');
      setFiles([]);
      setError(null);
      setNextPageToken(undefined);
      setBatchCount(1);
      loadFiles();
    }
  }, [open, loadFiles]);

  const handleSearchChange = (value: string) => {
    setSearch(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      loadFiles(value);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleFileClick = async (file: DriveFile) => {
    setLoadingFileId(file.id);
    try {
      const result = await getDriveFileContent(file.id);
      if (result.success && result.content) {
        const doc: ThreadDocumentUI = {
          name: file.name,
          content: result.content,
          size: new Blob([result.content]).size,
          type: file.mime_type || 'text/plain',
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t('search-placeholder')}
            className="pl-9"
            autoFocus
          />
        </div>

        {error && <div className="text-sm text-red-500 px-1">{error}</div>}

        <div
          ref={scrollContainerRef}
          className="max-h-72 overflow-y-auto -mx-1"
        >
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-400" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {search ? t('no-results') : t('no-files')}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {files.map((file) => {
                const isFileLoading = loadingFileId === file.id;
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => handleFileClick(file)}
                    disabled={loadingFileId !== null}
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {isFileLoading ? (
                      <div className="size-5 shrink-0 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-zinc-400" />
                      </div>
                    ) : (
                      <img
                        src="/assets/connectors/google-docs.svg"
                        alt="Google Doc"
                        className="size-5 shrink-0"
                      />
                    )}
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
                );
              })}

              {/* Sentinel for intersection observer */}
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
