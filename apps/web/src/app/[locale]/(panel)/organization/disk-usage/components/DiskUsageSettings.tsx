'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import prettyBytes from 'pretty-bytes';
import { toast } from 'sonner';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';

import { Button } from '@ragenai/common-ui/Button';
import { StorageProgressBarDetailed } from '@/app/components/Storage/StorageProgressBar';
import { defaultStorageLimits } from '@/features/organizations/constants/settings';
import type {
  OrgStorageSummary,
  ProjectStorageSummary,
  StorageUsage,
  StorageLimits,
} from '@/features/organizations/contracts/organization.types';

import {
  getAdminStorageOverview,
  getAdminOrgProjects,
  getAdminOrgStorageDetails,
  updateOrgStorageLimitsAction,
  getDiskOrganizationsForFilter,
  getDiskProjectsForFilter,
} from '../actions';

const CATEGORY_COLORS = {
  knowledgeBase: '#3b82f6',
  projectFiles: '#10b981',
  threadFiles: '#f59e0b',
};

type DiskUsageSettingsProps = {
  isAppAdmin?: boolean;
  orgId?: string;
};

export function DiskUsageSettings({
  isAppAdmin = false,
  orgId: _orgId,
}: DiskUsageSettingsProps) {
  const [orgs, setOrgs] = useState<OrgStorageSummary[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [orgDetails, setOrgDetails] = useState<{
    usage: StorageUsage;
    limits: StorageLimits | null;
  } | null>(null);
  const [projects, setProjects] = useState<ProjectStorageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter state
  const [filterOrgs, setFilterOrgs] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [filterProjects, setFilterProjects] = useState<
    { id: string; title: string; orgName: string }[]
  >([]);
  const [filterOrgId, setFilterOrgId] = useState<string>('');
  const [filterProjectId, setFilterProjectId] = useState<string>('');

  // Limit edit state
  const [editingOrgLimit, setEditingOrgLimit] = useState('');
  const [editingProjectLimit, setEditingProjectLimit] = useState('');
  const [editingFileLimit, setEditingFileLimit] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Stale async guard
  const selectOrgRequestId = useRef(0);

  const loadOrgs = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getAdminStorageOverview();
      setOrgs(data);
      // Org admins: auto-select their org
      if (!isAppAdmin && data.length === 1 && data[0]) {
        handleSelectOrg(data[0].orgId);
      }
    } catch {
      toast.error('Failed to load storage data');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAppAdmin]);

  useEffect(() => {
    loadOrgs();
    if (isAppAdmin) {
      getDiskOrganizationsForFilter()
        .then(setFilterOrgs)
        .catch(() => toast.error('Failed to load organization filters'));
    }
  }, [loadOrgs, isAppAdmin]);

  useEffect(() => {
    getDiskProjectsForFilter(filterOrgId || undefined)
      .then(setFilterProjects)
      .catch(() => toast.error('Failed to load project filters'));
  }, [filterOrgId]);

  const handleSelectOrg = async (orgId: string) => {
    const requestId = ++selectOrgRequestId.current;
    setSelectedOrg(orgId);
    try {
      const [details, projectData] = await Promise.all([
        getAdminOrgStorageDetails(orgId),
        getAdminOrgProjects(orgId),
      ]);

      // Ignore stale response if user clicked another org
      if (requestId !== selectOrgRequestId.current) {
        return;
      }

      setOrgDetails(details);
      setProjects(projectData);

      const limits = details.limits;
      setEditingOrgLimit(
        String(
          Math.round(
            (limits?.storageLimitBytes ??
              defaultStorageLimits.storageLimitBytes) /
              (1024 * 1024),
          ),
        ),
      );
      setEditingProjectLimit(
        String(
          Math.round(
            (limits?.projectStorageLimitBytes ??
              defaultStorageLimits.projectStorageLimitBytes) /
              (1024 * 1024),
          ),
        ),
      );
      setEditingFileLimit(
        String(
          Math.round(
            (limits?.singleFileLimitBytes ??
              defaultStorageLimits.singleFileLimitBytes) /
              (1024 * 1024),
          ),
        ),
      );
    } catch {
      if (requestId === selectOrgRequestId.current) {
        toast.error('Failed to load organization details');
      }
    }
  };

  const handleSaveLimits = async () => {
    if (!selectedOrg) {
      return;
    }

    const orgMB = Number(editingOrgLimit);
    const projMB = Number(editingProjectLimit);
    const fileMB = Number(editingFileLimit);

    if (
      !Number.isFinite(orgMB) ||
      orgMB < 1 ||
      !Number.isFinite(projMB) ||
      projMB < 1 ||
      !Number.isFinite(fileMB) ||
      fileMB < 1
    ) {
      toast.error('All limits must be positive numbers');
      return;
    }

    setIsSaving(true);
    try {
      await updateOrgStorageLimitsAction(selectedOrg, {
        storageLimitMB: orgMB,
        projectLimitMB: projMB,
        fileLimitMB: fileMB,
      });
      toast.success('Storage limits updated');
      const details = await getAdminOrgStorageDetails(selectedOrg);
      setOrgDetails(details);
      loadOrgs();
    } catch {
      toast.error('Failed to update limits');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  const selectedOrgData = orgs.find((o) => o.orgId === selectedOrg);

  // Apply filters to displayed orgs
  const filteredOrgs = orgs.filter((o) => {
    if (filterOrgId && o.orgId !== filterOrgId) {
      return false;
    }
    return true;
  });

  // Filter projects in detail view when a project filter is selected
  const filteredProjects = filterProjectId
    ? projects.filter((p) => p.projectId === filterProjectId)
    : projects;

  // Prepare bar chart data for filtered orgs
  const barChartData = filteredOrgs
    .filter((o) => o.totalBytes > 0)
    .map((o) => ({
      name: o.orgName.length > 20 ? o.orgName.slice(0, 20) + '...' : o.orgName,
      usage: o.totalBytes / (1024 * 1024),
      limit:
        (o.storageLimitBytes ?? defaultStorageLimits.storageLimitBytes) /
        (1024 * 1024),
    }));

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {isAppAdmin && (
          <select
            value={filterOrgId}
            onChange={(e) => {
              setFilterOrgId(e.target.value);
              setFilterProjectId('');
              if (e.target.value) {
                handleSelectOrg(e.target.value);
              } else {
                setSelectedOrg(null);
                setOrgDetails(null);
              }
            }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm min-w-[180px]"
          >
            <option value="">All organizations</option>
            {filterOrgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm min-w-[180px]"
        >
          <option value="">All projects</option>
          {filterProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
              {!filterOrgId && p.orgName ? ` (${p.orgName})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Overview: all orgs bar chart — app admins only */}
      {isAppAdmin && (
        <section>
          <h2 className="text-lg font-semibold mb-4">
            Storage Usage by Organization
          </h2>
          {barChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barChartData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  label={{
                    value: 'MB',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 12 },
                  }}
                />
                <RechartsTooltip
                  formatter={(value) => `${Number(value).toFixed(2)} MB`}
                />
                <Legend />
                <Bar dataKey="usage" fill="#3b82f6" name="Used (MB)" />
                <Bar dataKey="limit" fill="#e5e7eb" name="Limit (MB)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">
              No storage usage data yet.
            </p>
          )}
        </section>
      )}

      {/* Organization list — app admins only */}
      {isAppAdmin && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Organizations</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Organization</th>
                  <th className="text-right p-3 font-medium">Files</th>
                  <th className="text-right p-3 font-medium">Pages</th>
                  <th className="text-right p-3 font-medium">Usage</th>
                  <th className="text-right p-3 font-medium">Limit</th>
                  <th className="text-right p-3 font-medium">% Used</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {filteredOrgs.map((org) => {
                  const limit =
                    org.storageLimitBytes ??
                    defaultStorageLimits.storageLimitBytes;
                  const pct =
                    limit > 0
                      ? Math.min(100, (org.totalBytes / limit) * 100)
                      : 0;
                  return (
                    <tr
                      key={org.orgId}
                      role="button"
                      tabIndex={0}
                      className={`border-t hover:bg-muted/30 cursor-pointer transition-colors ${
                        selectedOrg === org.orgId ? 'bg-muted/50' : ''
                      }`}
                      onClick={() => handleSelectOrg(org.orgId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectOrg(org.orgId);
                        }
                      }}
                    >
                      <td className="p-3 font-medium">{org.orgName}</td>
                      <td className="p-3 text-right">{org.fileCount}</td>
                      <td className="p-3 text-right">
                        {org.pageCount.toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        {prettyBytes(org.totalBytes)}
                      </td>
                      <td className="p-3 text-right">{prettyBytes(limit)}</td>
                      <td className="p-3 text-right">
                        <span
                          className={(() => {
                            if (pct > 90) {
                              return 'text-red-500 font-semibold';
                            }
                            if (pct > 70) {
                              return 'text-amber-500';
                            }
                            return '';
                          })()}
                        >
                          {pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-right text-xs text-muted-foreground">
                        {selectedOrg === org.orgId
                          ? 'Selected'
                          : 'Click to view'}
                      </td>
                    </tr>
                  );
                })}
                {filteredOrgs.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-6 text-center text-muted-foreground"
                    >
                      No organizations found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Selected org detail */}
      {selectedOrg && orgDetails && selectedOrgData && (
        <section className="space-y-6 border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{selectedOrgData.orgName}</h2>
            {isAppAdmin && (
              <button
                onClick={() => {
                  setSelectedOrg(null);
                  setOrgDetails(null);
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            )}
          </div>

          {/* Overall progress */}
          <StorageProgressBarDetailed
            usedBytes={orgDetails.usage.totalBytes}
            limitBytes={
              orgDetails.limits?.storageLimitBytes ??
              defaultStorageLimits.storageLimitBytes
            }
          />

          {/* Category breakdown: pie chart + details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold mb-3">Storage Breakdown</h3>
              {orgDetails.usage.totalBytes > 0 ? (
                (() => {
                  const pieData = [
                    {
                      name: 'Knowledge Base',
                      value: orgDetails.usage.knowledgeBaseBytes,
                      color: CATEGORY_COLORS.knowledgeBase,
                    },
                    {
                      name: 'Project Files',
                      value: orgDetails.usage.projectFilesBytes,
                      color: CATEGORY_COLORS.projectFiles,
                    },
                    {
                      name: 'Thread Files',
                      value: orgDetails.usage.threadFilesBytes,
                      color: CATEGORY_COLORS.threadFiles,
                    },
                  ].filter((d) => d.value > 0);

                  return (
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
                  );
                })()
              ) : (
                <p className="text-sm text-muted-foreground">No files</p>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold mb-3">By Category</h3>
              <CategoryRow
                color={CATEGORY_COLORS.knowledgeBase}
                label="Knowledge Base"
                bytes={orgDetails.usage.knowledgeBaseBytes}
                count={orgDetails.usage.knowledgeBaseFileCount}
                pages={orgDetails.usage.knowledgeBasePageCount}
              />
              <CategoryRow
                color={CATEGORY_COLORS.projectFiles}
                label="Project Files"
                bytes={orgDetails.usage.projectFilesBytes}
                count={orgDetails.usage.projectFilesFileCount}
                pages={orgDetails.usage.projectFilesPageCount}
              />
              <CategoryRow
                color={CATEGORY_COLORS.threadFiles}
                label="Thread Files"
                bytes={orgDetails.usage.threadFilesBytes}
                count={orgDetails.usage.threadFilesFileCount}
                pages={orgDetails.usage.threadFilesPageCount}
              />
              <div className="border-t pt-2">
                <CategoryRow
                  color="#6b7280"
                  label="Total"
                  bytes={orgDetails.usage.totalBytes}
                  count={orgDetails.usage.totalFileCount}
                  pages={orgDetails.usage.totalPageCount}
                />
              </div>
            </div>
          </div>

          {/* Per-project breakdown */}
          {filteredProjects.length > 0 && (
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
                    {filteredProjects.map((p) => (
                      <tr key={p.projectId} className="border-t">
                        <td className="p-2">{p.projectTitle}</td>
                        <td className="p-2 text-right">{p.fileCount}</td>
                        <td className="p-2 text-right">
                          {p.pageCount.toLocaleString()}
                        </td>
                        <td className="p-2 text-right">
                          {prettyBytes(p.totalBytes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Admin controls: edit limits — app admins only */}
          {isAppAdmin && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Storage Limits</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <LimitInput
                  label="Organization Limit (MB)"
                  value={editingOrgLimit}
                  onChange={setEditingOrgLimit}
                />
                <LimitInput
                  label="Project Limit (MB)"
                  value={editingProjectLimit}
                  onChange={setEditingProjectLimit}
                />
                <LimitInput
                  label="Single File Limit (MB)"
                  value={editingFileLimit}
                  onChange={setEditingFileLimit}
                />
              </div>
              <div className="flex justify-end mt-4">
                <Button onClick={handleSaveLimits} isLoading={isSaving}>
                  Save Limits
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
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

function LimitInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">
        {label}
      </label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}
