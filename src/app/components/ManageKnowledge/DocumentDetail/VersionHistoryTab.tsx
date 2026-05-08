'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from '@/i18n/routing';
import type { DocumentVersionSummary } from '@/features/documents/contracts/document-version.types';
import { ScoreBadge } from './ScoreBadge';

type Props = { documentId: string; orgId: string };

const CHANGE_TYPE_LABELS: Record<string, string> = {
  UPLOAD: 'Wgranie',
  MANUAL: 'Ręczna edycja',
  AI_REWRITE: 'Przepisanie AI',
  AI_OPTIMIZE: 'Optymalizacja AI',
  ROLLBACK: 'Przywrócenie',
};

const CHANGE_TYPE_COLORS: Record<string, string> = {
  UPLOAD: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300',
  MANUAL: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
  AI_REWRITE:
    'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
  AI_OPTIMIZE:
    'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300',
  ROLLBACK:
    'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
};

export function VersionHistoryTab({ documentId }: Props) {
  const [versions, setVersions] = useState<DocumentVersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const router = useRouter();

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions);
      }
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleRollback = async (versionId: string) => {
    setRollingBack(versionId);
    try {
      const res = await fetch(
        `/api/documents/${documentId}/versions/${versionId}/rollback`,
        { method: 'POST' },
      );
      if (res.ok) {
        await fetchVersions();
      }
    } finally {
      setRollingBack(null);
    }
  };

  const handleDiff = (v1Id: string, v2Id: string) => {
    router.push(
      `/knowledge/documents/${documentId}/diff?v1=${v1Id}&v2=${v2Id}` as Parameters<
        typeof router.push
      >[0],
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-500">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300" />
        <span className="ml-3 text-sm">Ładowanie historii wersji…</span>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 text-center dark:border-zinc-700">
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
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Brak historii wersji
        </p>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          Wersje pojawią się po pierwszej edycji lub optymalizacji dokumentu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {versions.map((version, idx) => (
        <div
          key={version.id}
          className={`flex items-center justify-between rounded-lg border p-4 shadow-sm transition-colors ${
            version.isActive
              ? 'border-indigo-200 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/20'
              : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800'
          }`}
        >
          <div className="flex items-center gap-4">
            {/* Numer wersji — dominujący */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-zinc-900 dark:text-white">
                v{version.versionNumber}
              </span>
              {version.isActive && (
                <span className="rounded px-1.5 py-0.5 text-xs font-medium text-indigo-400 outline outline-1 outline-indigo-600 dark:text-indigo-400 dark:outline-indigo-600">
                  aktywna
                </span>
              )}
            </div>

            {/* Typ zmiany */}
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                CHANGE_TYPE_COLORS[version.changeType] ??
                CHANGE_TYPE_COLORS.UPLOAD
              }`}
            >
              {CHANGE_TYPE_LABELS[version.changeType] ?? version.changeType}
            </span>

            {/* Meta — autor i data */}
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {version.authorName ?? 'System'}&nbsp;&middot;&nbsp;
              {new Date(version.createdAt).toLocaleString('pl-PL')}
            </span>

            {/* Score z paskiem */}
            {version.ragScore ? (
              <ScoreBadge total={version.ragScore.total} />
            ) : (
              <span className="text-xs text-zinc-400 dark:text-zinc-600">
                — brak score
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {idx < versions.length - 1 && (
              <button
                onClick={() => handleDiff(versions[idx + 1].id, version.id)}
                className="rounded-md px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Porównaj
              </button>
            )}
            {!version.isActive && (
              <button
                onClick={() => handleRollback(version.id)}
                disabled={rollingBack === version.id}
                className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500"
              >
                {rollingBack === version.id ? 'Przywracanie…' : 'Przywróć'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
