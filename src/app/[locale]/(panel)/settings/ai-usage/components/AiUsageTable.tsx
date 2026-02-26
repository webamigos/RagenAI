'use client';

import { useState, useEffect } from 'react';
import type { AiUsageListItem } from '@/features/ai-usage/contracts/ai-usage.types';

type Props = {
  items: AiUsageListItem[];
};

const PAGE_SIZE = 20;

const STEP_BADGE_COLORS: Record<string, string> = {
  CHAT_COMPLETION:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  MODERATION:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  REPHRASING:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  EMBEDDINGS:
    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTokens(n: number): string {
  return n.toLocaleString();
}

export function AiUsageTable({ items }: Props) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [items]);

  if (items.length === 0) return null;

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          Usage Records ({items.length})
        </h2>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded border border-input disabled:opacity-40 hover:bg-muted"
            >
              Prev
            </button>
            <span className="text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-2 py-1 rounded border border-input disabled:opacity-40 hover:bg-muted"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Date</th>
              <th className="text-left p-3 font-medium">Step</th>
              <th className="text-left p-3 font-medium">Model</th>
              <th className="text-left p-3 font-medium">Organization</th>
              <th className="text-left p-3 font-medium">Project</th>
              <th className="text-left p-3 font-medium">User</th>
              <th className="text-right p-3 font-medium">Input</th>
              <th className="text-right p-3 font-medium">Output</th>
              <th className="text-right p-3 font-medium">Total</th>
              <th className="text-right p-3 font-medium">Cost</th>
              <th className="text-right p-3 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => (
              <tr key={item.publicId} className="border-t hover:bg-muted/30">
                <td className="p-3 whitespace-nowrap">
                  {formatDate(item.createdAt)}
                </td>
                <td className="p-3">
                  <span
                    className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                      STEP_BADGE_COLORS[item.step] ??
                      'bg-muted text-muted-foreground'
                    }`}
                  >
                    {item.step.replace('_', ' ')}
                  </span>
                </td>
                <td className="p-3 font-mono text-xs max-w-[180px] truncate">
                  {item.model}
                </td>
                <td className="p-3 max-w-[140px] truncate">
                  {item.organizationName}
                </td>
                <td className="p-3 max-w-[120px] truncate text-muted-foreground">
                  {item.project?.title ?? '—'}
                </td>
                <td className="p-3 max-w-[140px] truncate text-muted-foreground">
                  {item.user ? (item.user.name ?? item.user.email) : '—'}
                </td>
                <td className="p-3 text-right font-mono text-xs">
                  {formatTokens(item.inputTokens)}
                </td>
                <td className="p-3 text-right font-mono text-xs">
                  {formatTokens(item.outputTokens)}
                </td>
                <td className="p-3 text-right font-mono text-xs font-medium">
                  {formatTokens(item.totalTokens)}
                </td>
                <td className="p-3 text-right font-mono text-xs">
                  ${item.estimatedCost.toFixed(4)}
                </td>
                <td className="p-3 text-right text-xs text-muted-foreground">
                  {item.durationMs != null ? `${item.durationMs}ms` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
