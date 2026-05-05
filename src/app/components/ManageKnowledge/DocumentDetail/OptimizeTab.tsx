'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { SuggestionCard } from './SuggestionCard';
import { SuggestionDetailModal } from './SuggestionDetailModal';
import type { OptimizationSuggestion } from '@/features/documents/contracts/optimization-suggestion.types';

type JobStatus = 'pending' | 'processing' | 'done' | 'failed';

type OptimizationJob = {
  id: string;
  status: JobStatus;
  baseScore: number | null;
  suggestions: OptimizationSuggestion[];
  error?: string;
  startedAt: string;
  completedAt?: string;
};

type Props = {
  documentId: string;
  orgId: string;
  fileType: string;
};

const UNSUPPORTED_TYPES = new Set(['IMAGE', 'XLSX', 'CSV']);
const POLL_INTERVAL_MS = 4_000;

function getButtonLabel(running: boolean): string {
  return running ? 'Analizuję…' : 'Generuj sugestie';
}

export function OptimizeTab({ documentId, fileType }: Props) {
  const [job, setJob] = useState<OptimizationJob | null>(null);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
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
        throw new Error(body.error ?? 'Generowanie sugestii nie powiodło się');
      }

      await fetchJob();
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd');
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
            suggestions: job.suggestions,
          }),
        },
      );
      if (!res.ok) {
        throw new Error('Zastosowanie sugestii nie powiodło się');
      }
      const result = await res.json();
      setApplied({ scoreAfter: result.newRagScore?.total });
      setJob(null);
      setAcceptedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd');
    } finally {
      setApplying(false);
    }
  }, [documentId, acceptedIds, job]);

  const isRunning = job?.status === 'pending' || job?.status === 'processing';
  const suggestions = job?.status === 'done' ? job.suggestions : [];

  if (UNSUPPORTED_TYPES.has(fileType)) {
    return (
      <div className="py-8 text-center text-gray-500">
        Ten typ pliku nie jest obsługiwany przez optymalizację RAG.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium text-gray-900 dark:text-white">
            Optymalizacja pod RAG
          </h2>
          <p className="text-sm text-gray-500">
            AI zaproponuje konkretne zmiany poprawiające jakość retrieval.
            Proces może potrwać kilka minut.
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={starting || isRunning}
          className="rounded bg-[#cb1d3d] px-4 py-2 text-sm font-medium text-white hover:bg-[#a01830] disabled:opacity-50"
        >
          {starting ? 'Uruchamiam…' : getButtonLabel(isRunning)}
        </button>
      </div>

      {isRunning && (
        <div className="flex items-center gap-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          Trwa analiza dokumentu i scoring sugestii w tle…
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {job?.status === 'failed' && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Analiza nie powiodła się. {job.error ?? ''}
        </div>
      )}

      {applied && (
        <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          <p className="font-medium">Zmiany zastosowane!</p>
          <p className="mt-1 text-green-600 dark:text-green-400">
            Dokument jest ponownie indeksowany i oceniany w tle. Nowy scoring
            pojawi się w Historii wersji po zakończeniu.
          </p>
        </div>
      )}

      {job?.status === 'done' && suggestions.length === 0 && (
        <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
          Brak sugestii poprawiających dokument — jest już dobrze
          zoptymalizowany pod RAG.
          {job.baseScore !== null && ` Aktualny scoring: ${job.baseScore}`}
        </div>
      )}

      {suggestions.length > 0 && (
        <>
          {job?.baseScore !== null && (
            <p className="text-sm text-gray-500">
              Aktualny scoring:{' '}
              <span className="font-medium">{job?.baseScore}</span>
            </p>
          )}

          <div className="space-y-3">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                isAccepted={acceptedIds.has(suggestion.id)}
                onAccept={(id) =>
                  setAcceptedIds((prev) => new Set([...prev, id]))
                }
                onReject={(id) =>
                  setAcceptedIds((prev) => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                  })
                }
                onShowDetails={(s) => {
                  setDetailSuggestion(s);
                  setModalOpen(true);
                }}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              onClick={() =>
                setAcceptedIds(new Set(suggestions.map((s) => s.id)))
              }
              className="rounded border border-green-600 px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 dark:border-green-500 dark:text-green-400"
            >
              Zaakceptuj wszystkie
            </button>
            <button
              onClick={() => setAcceptedIds(new Set())}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300"
            >
              Odrzuć wszystkie
            </button>
            <button
              onClick={handleApply}
              disabled={acceptedIds.size === 0 || applying}
              className="ml-auto rounded bg-[#cb1d3d] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#a01830] disabled:opacity-50"
            >
              {applying
                ? 'Zastosowuję…'
                : `Zastosuj zaakceptowane (${acceptedIds.size})`}
            </button>
          </div>
        </>
      )}

      <SuggestionDetailModal
        suggestion={detailSuggestion}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onAccept={(id) => setAcceptedIds((prev) => new Set([...prev, id]))}
        onReject={(id) =>
          setAcceptedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          })
        }
        isAccepted={
          detailSuggestion ? acceptedIds.has(detailSuggestion.id) : false
        }
      />
    </div>
  );
}
