'use client';

import { useState } from 'react';
import type { AuditLogPaginatedResult } from '@/features/audit-logs/contracts/audit-log.types';

type Props = {
  data: AuditLogPaginatedResult;
  isLoading: boolean;
  onPageChange: (page: number) => void;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function JsonDiff({
  oldData,
  newData,
}: {
  oldData: unknown;
  newData: unknown;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 p-4">
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Old data
        </p>
        <pre className="overflow-auto rounded bg-muted p-2 text-xs">
          {oldData ? JSON.stringify(oldData, null, 2) : '—'}
        </pre>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          New data
        </p>
        <pre className="overflow-auto rounded bg-muted p-2 text-xs">
          {newData ? JSON.stringify(newData, null, 2) : '—'}
        </pre>
      </div>
    </div>
  );
}

export function AuditLogsTable({ data, isLoading, onPageChange }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className={isLoading ? 'opacity-50' : ''}>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity Type</th>
              <th className="px-4 py-3">Entity ID</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => {
              const hasData = Boolean(item.oldData || item.newData);
              const isExpanded = expandedId === item.id;

              return (
                <tr key={item.id} className="group">
                  <td colSpan={6} className="p-0">
                    <div
                      className={`flex cursor-pointer border-b border-border transition-colors ${
                        hasData ? 'hover:bg-muted/30' : 'cursor-default'
                      }`}
                      onClick={() => {
                        if (hasData) {
                          setExpandedId(isExpanded ? null : item.id);
                        }
                      }}
                    >
                      <div className="w-[180px] shrink-0 px-4 py-3">
                        {formatDate(item.createdAt)}
                      </div>
                      <div className="w-[160px] shrink-0 truncate px-4 py-3">
                        {item.organizationName}
                      </div>
                      <div className="w-[180px] shrink-0 truncate px-4 py-3">
                        {item.user
                          ? `${item.user.name ?? ''} (${item.user.email})`
                          : '—'}
                      </div>
                      <div className="w-[200px] shrink-0 px-4 py-3">
                        <span className="inline-block rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-primary dark:bg-primary/30">
                          {item.action}
                        </span>
                      </div>
                      <div className="w-[120px] shrink-0 px-4 py-3">
                        {item.entityType}
                      </div>
                      <div className="min-w-0 flex-1 truncate px-4 py-3 font-mono text-xs">
                        {item.entityId ?? '—'}
                      </div>
                    </div>
                    {isExpanded && hasData && (
                      <JsonDiff oldData={item.oldData} newData={item.newData} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages} ({data.totalCount} total)
          </p>
          <div className="flex gap-2">
            <button
              disabled={data.page <= 1}
              onClick={() => onPageChange(data.page - 1)}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={data.page >= data.totalPages}
              onClick={() => onPageChange(data.page + 1)}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
