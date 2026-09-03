'use client';

import { useState, useEffect } from 'react';
import prettyBytes from 'pretty-bytes';
import { toast } from 'sonner';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';

import { StorageProgressBarDetailed } from '@/app/components/Storage/StorageProgressBar';
import { defaultStorageLimits } from '@/features/organizations/constants/settings';
import type {
  ProjectStorageSummary,
  StorageUsage,
  StorageLimits,
} from '@/features/organizations/contracts/organization.types';

import { getOrgProjects, getOrgStorageDetails } from '../actions';

/**
 * Storage for the caller's own organization.
 *
 * This component used to serve two audiences at once. A platform
 * administrator saw an organization list, a cross-organization bar chart, an
 * organization picker and editable ceilings; an organization admin saw one
 * organization's detail, reached by auto-selecting the single row the server
 * happened to return. ADR-35 moved the first set into apps/admin, which has
 * them with filters, totals and CSV export.
 *
 * What is left is the second audience's view, without the machinery that
 * existed only to narrow the first one down to it: no list, no selection, no
 * stale-response guard, no filters.
 *
 * The limit editor went too. It called an action guarded by `requireAppAdmin`,
 * so no organization admin could ever save — the control was rendered for
 * people it always refused. Ceilings are set in the panel, under **Limits**.
 */

const CATEGORY_COLORS = {
  knowledgeBase: '#3b82f6',
  projectFiles: '#10b981',
  threadFiles: '#f59e0b',
};

export function DiskUsageSettings() {
  const [details, setDetails] = useState<{
    usage: StorageUsage;
    limits: StorageLimits | null;
  } | null>(null);
  const [projects, setProjects] = useState<ProjectStorageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    Promise.all([getOrgStorageDetails(), getOrgProjects()])
      .then(([detailData, projectData]) => {
        if (ignore) {
          return;
        }
        setDetails(detailData);
        setProjects(projectData);
      })
      .catch(() => {
        if (!ignore) {
          toast.error('Failed to load storage data');
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  if (!details) {
    return (
      <p className="text-sm text-muted-foreground">
        Storage data is unavailable.
      </p>
    );
  }

  const { usage, limits } = details;

  const pieData = [
    {
      name: 'Knowledge Base',
      value: usage.knowledgeBaseBytes,
      color: CATEGORY_COLORS.knowledgeBase,
    },
    {
      name: 'Project Files',
      value: usage.projectFilesBytes,
      color: CATEGORY_COLORS.projectFiles,
    },
    {
      name: 'Thread Files',
      value: usage.threadFilesBytes,
      color: CATEGORY_COLORS.threadFiles,
    },
  ].filter((slice) => slice.value > 0);

  return (
    <section className="space-y-6">
      <StorageProgressBarDetailed
        usedBytes={usage.totalBytes}
        limitBytes={
          limits?.storageLimitBytes ?? defaultStorageLimits.storageLimitBytes
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold mb-3">Storage Breakdown</h3>
          {usage.totalBytes > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={(props: PieLabelRenderProps) =>
                    `${props.name} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value) => prettyBytes(Number(value))}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No files</p>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold mb-3">By Category</h3>
          <CategoryRow
            color={CATEGORY_COLORS.knowledgeBase}
            label="Knowledge Base"
            bytes={usage.knowledgeBaseBytes}
            count={usage.knowledgeBaseFileCount}
            pages={usage.knowledgeBasePageCount}
          />
          <CategoryRow
            color={CATEGORY_COLORS.projectFiles}
            label="Project Files"
            bytes={usage.projectFilesBytes}
            count={usage.projectFilesFileCount}
            pages={usage.projectFilesPageCount}
          />
          <CategoryRow
            color={CATEGORY_COLORS.threadFiles}
            label="Thread Files"
            bytes={usage.threadFilesBytes}
            count={usage.threadFilesFileCount}
            pages={usage.threadFilesPageCount}
          />
          <div className="border-t pt-2">
            <CategoryRow
              color="#6b7280"
              label="Total"
              bytes={usage.totalBytes}
              count={usage.totalFileCount}
              pages={usage.totalPageCount}
            />
          </div>
        </div>
      </div>

      {projects.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">By Project</h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Project</th>
                  <th className="text-right p-2 font-medium">Files</th>
                  <th className="text-right p-2 font-medium">Pages</th>
                  <th className="text-right p-2 font-medium">Usage</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.projectId} className="border-t">
                    <td className="p-2">{project.projectTitle}</td>
                    <td className="p-2 text-right">{project.fileCount}</td>
                    <td className="p-2 text-right">
                      {project.pageCount.toLocaleString()}
                    </td>
                    <td className="p-2 text-right">
                      {prettyBytes(project.totalBytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function CategoryRow({
  color,
  label,
  bytes,
  count,
  pages,
}: {
  color: string;
  label: string;
  bytes: number;
  count: number;
  pages: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div
          className="size-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-sm text-right">
        <span className="font-medium">{prettyBytes(bytes)}</span>
        <span className="text-muted-foreground ml-2">
          ({count} {count === 1 ? 'file' : 'files'}
          {pages > 0 &&
            ` · ${pages.toLocaleString()} ${pages === 1 ? 'page' : 'pages'}`}
          )
        </span>
      </div>
    </div>
  );
}
