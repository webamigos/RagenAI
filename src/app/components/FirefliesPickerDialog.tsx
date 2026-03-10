'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  searchFirefliesTranscripts,
  getFirefliesTranscriptContent,
  type FirefliesTranscript,
} from '@/app/actions/fireflies';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelected: (doc: ThreadDocumentUI) => void;
};

export const FirefliesPickerDialog = ({
  open,
  onOpenChange,
  onFileSelected,
}: Props) => {
  const t = useTranslations('fireflies-picker');
  const locale = useLocale();
  const [transcripts, setTranscripts] = useState<FirefliesTranscript[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTranscriptId, setLoadingTranscriptId] = useState<string | null>(
    null,
  );
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef<number>(0);

  const loadTranscripts = useCallback(
    async (query: string = '') => {
      const currentRequestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const result = await searchFirefliesTranscripts(query);
        if (currentRequestId !== requestIdRef.current) {
          return;
        }
        if (result.success && result.transcripts) {
          setTranscripts(result.transcripts);
        } else {
          setTranscripts([]);
          if (result.error) {
            setError(result.error);
          }
        }
      } catch {
        if (currentRequestId !== requestIdRef.current) {
          return;
        }
        setTranscripts([]);
        setError(t('fetch-error'));
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [t],
  );

  useEffect(() => {
    if (open) {
      setSearch('');
      setTranscripts([]);
      setError(null);
      loadTranscripts();
    }
  }, [open, loadTranscripts]);

  const handleSearchChange = (value: string) => {
    setSearch(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      loadTranscripts(value);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleTranscriptClick = async (transcript: FirefliesTranscript) => {
    setLoadingTranscriptId(transcript.id);
    try {
      const result = await getFirefliesTranscriptContent(transcript.id);
      if (result.success && result.content) {
        const doc: ThreadDocumentUI = {
          name: transcript.title || t('untitled-transcript'),
          content: result.content,
          size: new Blob([result.content]).size,
          type: 'text/plain',
          sourceUrl: result.transcript_url,
        };
        onFileSelected(doc);
        onOpenChange(false);
      } else {
        setError(result.error || t('fetch-error'));
      }
    } catch {
      setError(t('fetch-error'));
    } finally {
      setLoadingTranscriptId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) {
      return '';
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) {
      return '';
    }
    const mins = Math.round(seconds / 60);
    if (mins < 60) {
      return `${mins}m`;
    }
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  };

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

        <div className="max-h-72 overflow-y-auto -mx-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-400" />
            </div>
          ) : transcripts.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {search ? t('no-results') : t('no-transcripts')}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {transcripts.map((transcript) => {
                const isTranscriptLoading =
                  loadingTranscriptId === transcript.id;
                return (
                  <button
                    key={transcript.id}
                    type="button"
                    onClick={() => handleTranscriptClick(transcript)}
                    disabled={loadingTranscriptId !== null}
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {isTranscriptLoading ? (
                      <div className="size-5 shrink-0 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-zinc-400" />
                      </div>
                    ) : (
                      <img
                        src="/assets/connectors/fireflies.svg"
                        alt="Fireflies"
                        className="size-5 shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">
                        {transcript.title || t('untitled-transcript')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(transcript.date)}
                        {transcript.duration > 0 && (
                          <span className="ml-2">
                            {formatDuration(transcript.duration)}
                          </span>
                        )}
                        {transcript.participants?.length > 0 && (
                          <span className="ml-2">
                            {t('participant-count', {
                              count: transcript.participants.length,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
