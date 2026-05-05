'use client';

import { useState, useCallback } from 'react';
import { SuggestionCard } from './SuggestionCard';
import { SuggestionDetailModal } from './SuggestionDetailModal';
import type { OptimizationSuggestion } from '@/features/documents/contracts/optimization-suggestion.types';

type Props = {
  documentId: string;
  orgId: string;
  fileType: string;
};

const UNSUPPORTED_TYPES = new Set(['IMAGE', 'XLSX', 'CSV']);

export function OptimizeTab({ documentId, fileType }: Props) {
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ scoreAfter?: number } | null>(null);
  const [detailSuggestion, setDetailSuggestion] =
    useState<OptimizationSuggestion | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const isUnsupported = UNSUPPORTED_TYPES.has(fileType);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setAcceptedIds(new Set());
    setApplied(null);

    try {
      const res = await fetch(
        `/api/documents/${documentId}/optimize-suggestions`,
        {
          method: 'POST',
        },
      );

      if (!res.ok || !res.body) {
        throw new Error('Generowanie sugestii nie powiodło się');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n\n').filter((l) => l.startsWith('data: '));
        for (const line of lines) {
          const data = line.slice('data: '.length);
          if (data === '[DONE]') {
            break;
          }
          const parsed = JSON.parse(data);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.suggestion) {
            setSuggestions((prev) => [...prev, parsed.suggestion]);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  const handleApply = useCallback(async () => {
    if (acceptedIds.size === 0) {
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
            suggestions,
          }),
        },
      );
      if (!res.ok) {
        throw new Error('Zastosowanie sugestii nie powiodło się');
      }
      const result = await res.json();
      setApplied({ scoreAfter: result.newRagScore?.total });
      setSuggestions([]);
      setAcceptedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd');
    } finally {
      setApplying(false);
    }
  }, [documentId, acceptedIds, suggestions]);

  if (isUnsupported) {
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
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="rounded bg-[#cb1d3d] px-4 py-2 text-sm font-medium text-white hover:bg-[#a01830] disabled:opacity-50"
        >
          {loading ? 'Generuję sugestie…' : 'Generuj sugestie'}
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {applied && (
        <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          Zmiany zastosowane!
          {applied.scoreAfter !== undefined &&
            ` Nowy scoring: ${applied.scoreAfter}`}
        </div>
      )}

      {suggestions.length > 0 && (
        <>
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
