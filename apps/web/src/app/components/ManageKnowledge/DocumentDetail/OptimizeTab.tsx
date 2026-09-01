'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { SuggestionCard } from './SuggestionCard';
import { SuggestionDetailModal } from './SuggestionDetailModal';
import { ScoreBadge } from './ScoreBadge';
import type { OptimizationSuggestion } from '@/features/documents/contracts/optimization-suggestion.types';

type JobStatus = 'pending' | 'processing' | 'done' | 'failed';

type OptimizationJob = {
  id: string;
  status: JobStatus;
  baseScore: number | null;
  suggestions: OptimizationSuggestion[];
  noNewSuggestions?: boolean;
  error?: string;
  startedAt: string;
  completedAt?: string;
};

type Props = {
  documentId: string;
  fileType: string;
};

const UNSUPPORTED_TYPES = new Set(['IMAGE', 'XLSX', 'CSV']);
const POLL_INTERVAL_MS = 4_000;

export function OptimizeTab({ documentId, fileType }: Props) {
  const t = useTranslations('document-optimize');
  const [job, setJob] = useState<OptimizationJob | null>(null);
  const [fileRagScore, setFileRagScore] = useState<number | null>(null);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ scoreAfter?: number } | null>(null);
  const [detailSuggestion, setDetailSuggestion] =
    useState<OptimizationSuggestion | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/optimization-job`);
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      const fetched: OptimizationJob | null = data.job ?? null;
      setJob(fetched);
      setFileRagScore(data.fileRagScore ?? null);

      if (fetched?.status === 'done' || fetched?.status === 'failed') {
        stopPolling();
      }
    } catch {
      // network error — keep polling
    }
  }, [documentId, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollingRef.current = setInterval(fetchJob, POLL_INTERVAL_MS);
  }, [fetchJob, stopPolling]);

  // Stop polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // If there's an in-progress job on mount, resume polling
  useEffect(() => {
    fetchJob().then(() => {
      // polling started conditionally inside fetchJob based on status
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const handleGenerate = useCallback(async () => {
    setStarting(true);
    setError(null);
    setApplied(null);
    setAcceptedIds(new Set());
    setRejectedIds(new Set());
    setJob(null);

    try {
      const res = await fetch(
        `/api/documents/${documentId}/optimize-suggestions`,
        {
          method: 'POST',
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t('generate-failed'));
      }

      await fetchJob();
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknown-error'));
    } finally {
      setStarting(false);
    }
  }, [documentId, fetchJob, startPolling]);

  const handleApply = useCallback(async () => {
    if (acceptedIds.size === 0 || !job) {
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(
        `/api/documents/${documentId}/apply-suggestions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            acceptedSuggestionIds: Array.from(acceptedIds),
            rejectedSuggestionIds: Array.from(rejectedIds),
          }),
        },
      );
      if (!res.ok) {
        throw new Error(t('apply-failed'));
      }
      const result = await res.json();
      setApplied({ scoreAfter: result.newRagScore?.total });
      // Mark as processing optimistically so the Apply button stays disabled
      // until re-embedding + rescoring completes (polling will update status).
      setJob((prev) => (prev ? { ...prev, status: 'processing' } : null));
      setAcceptedIds(new Set());
      setRejectedIds(new Set());
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknown-error'));
    } finally {
      setApplying(false);
    }
  }, [documentId, acceptedIds, rejectedIds, job, startPolling]);

  const handleAccept = useCallback((id: string) => {
    setAcceptedIds((prev) => new Set([...prev, id]));
    setRejectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleReject = useCallback((id: string) => {
    setRejectedIds((prev) => new Set([...prev, id]));
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleUndo = useCallback((id: string) => {
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setRejectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isRunning = job?.status === 'pending' || job?.status === 'processing';
  const suggestions = job?.status === 'done' ? job.suggestions : [];
  const displayScore = fileRagScore ?? job?.baseScore ?? null;

  const generateLabel = () => {
    if (starting) {
      return t('starting');
    }
    return isRunning ? t('analyzing') : t('generate');
  };

  if (UNSUPPORTED_TYPES.has(fileType)) {
    return (
      <div className="py-8 text-center text-zinc-500">
        {t('unsupported-file-type')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            {t('title')}
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {t('subtitle')}
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={starting || isRunning}
          className="shrink-0 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {generateLabel()}
        </button>
      </div>

      {!job && !starting && !isRunning && !error && (
        <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 text-center dark:border-zinc-700">
          <svg
            className="mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
            />
          </svg>
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {t('empty-title')}
          </p>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            {t('empty-hint')}
          </p>
        </div>
      )}

      {isRunning && (
        <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
          <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600 dark:border-blue-700 dark:border-t-blue-400" />
          {t('running')}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {job?.status === 'failed' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {t('job-failed')} {job.error ?? ''}
        </div>
      )}

      {applied && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300">
          <p className="font-medium">{t('applied-title')}</p>
          <p className="mt-1 text-green-600 dark:text-green-400">
            {t('applied-hint')}
          </p>
        </div>
      )}

      {job?.status === 'done' && suggestions.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <p>
            {job.noNewSuggestions
              ? t('no-new-suggestions')
              : t('no-suggestions')}
          </p>
          {displayScore !== null && (
            <div className="mt-2 flex items-center gap-2">
              {t('current-score')}
              <ScoreBadge total={displayScore} />
            </div>
          )}
        </div>
      )}

      {suggestions.length > 0 && (
        <>
          {displayScore !== null && (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              {t('current-score')}
              <ScoreBadge total={displayScore} />
            </div>
          )}

          {job?.noNewSuggestions && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {t('no-new-suggestions-with-pending')}
            </div>
          )}

          <div className="space-y-3">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                isAccepted={acceptedIds.has(suggestion.id)}
                isRejected={rejectedIds.has(suggestion.id)}
                onAccept={handleAccept}
                onReject={handleReject}
                onUndo={handleUndo}
                onShowDetails={(s) => {
                  setDetailSuggestion(s);
                  setModalOpen(true);
                }}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <button
              onClick={() => {
                setAcceptedIds(new Set(suggestions.map((s) => s.id)));
                setRejectedIds(new Set());
              }}
              className="rounded-md border border-green-600 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950/30"
            >
              {t('accept-all')}
            </button>
            <button
              onClick={() => {
                setRejectedIds(new Set(suggestions.map((s) => s.id)));
                setAcceptedIds(new Set());
              }}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {t('reject-all')}
            </button>
            <button
              onClick={handleApply}
              disabled={acceptedIds.size === 0 || applying || isRunning}
              className="ml-auto rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500"
            >
              {applying
                ? t('applying')
                : t('apply-accepted', { count: acceptedIds.size })}
            </button>
          </div>
        </>
      )}

      <SuggestionDetailModal
        suggestion={detailSuggestion}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onAccept={handleAccept}
        onReject={handleReject}
        onUndo={handleUndo}
        isAccepted={
          detailSuggestion ? acceptedIds.has(detailSuggestion.id) : false
        }
        isRejected={
          detailSuggestion ? rejectedIds.has(detailSuggestion.id) : false
        }
      />
    </div>
  );
}
