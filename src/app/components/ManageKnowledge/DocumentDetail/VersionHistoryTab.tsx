'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from '@/i18n/routing';
import type { DocumentVersionSummary } from '@/features/documents/contracts/document-version.types';

type Props = { documentId: string; orgId: string };

const CHANGE_TYPE_LABELS: Record<string, string> = {
  UPLOAD: 'Wgranie',
  MANUAL: 'Ręczna edycja',
  AI_REWRITE: 'Przepisanie AI',
  AI_OPTIMIZE: 'Optymalizacja AI',
  ROLLBACK: 'Przywrócenie',
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
        {
          method: 'POST',
        },
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
      <div className="py-8 text-center text-gray-500">
        Ładowanie historii wersji…
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">
        Brak historii wersji.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {versions.map((version, idx) => (
        <div
          key={version.id}
          className={`flex items-center justify-between rounded-lg border p-4 ${
            version.isActive
              ? 'border-[#cb1d3d] bg-red-50 dark:bg-red-950/20'
              : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              v{version.versionNumber}
              {version.isActive && (
                <span className="ml-2 rounded bg-[#cb1d3d] px-1.5 py-0.5 text-xs text-white">
                  Aktywna
                </span>
              )}
            </div>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {CHANGE_TYPE_LABELS[version.changeType] ?? version.changeType}
            </span>
            <span className="text-xs text-gray-500">
              {version.authorName ?? 'System'} &middot;{' '}
              {new Date(version.createdAt).toLocaleString('pl-PL')}
            </span>
            {version.ragScore && (
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Score: {version.ragScore.total}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {idx < versions.length - 1 && (
              <button
                onClick={() => handleDiff(versions[idx + 1].id, version.id)}
                className="rounded px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Porównaj
              </button>
            )}
            {!version.isActive && (
              <button
                onClick={() => handleRollback(version.id)}
                disabled={rollingBack === version.id}
                className="rounded bg-[#cb1d3d] px-3 py-1 text-xs text-white hover:bg-[#a01830] disabled:opacity-50"
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
