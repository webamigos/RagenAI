'use client';

import { useState, useEffect } from 'react';
import { AiUsageStep } from '@/generated/prisma/enums';
import type { AiUsageFilters } from '@/features/ai-usage/contracts/ai-usage.types';
import {
  getOrganizationsForFilter,
  getProjectsForFilter,
  getUsersForFilter,
} from '../actions';

type Props = {
  filters: AiUsageFilters;
  onChange: (filters: AiUsageFilters) => void;
};

const PERIODS = [
  { value: '1d', label: 'Today' },
  { value: '7d', label: '7d' },
  { value: '14d', label: '14d' },
  { value: '30d', label: '30d' },
  { value: '365d', label: '1y' },
  { value: 'custom', label: 'Custom' },
] as const;

const STEPS = [
  { value: '', label: 'All steps' },
  { value: AiUsageStep.CHAT_COMPLETION, label: 'Chat Completion' },
  { value: AiUsageStep.MODERATION, label: 'Moderation' },
  { value: AiUsageStep.REPHRASING, label: 'Rephrasing' },
  { value: AiUsageStep.EMBEDDINGS, label: 'Embeddings' },
];

export function AiUsageFiltersBar({ filters, onChange }: Props) {
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<
    { publicId: string; title: string; orgName: string }[]
  >([]);
  const [users, setUsers] = useState<
    { id: string; name: string | null; email: string }[]
  >([]);
  const [customFrom, setCustomFrom] = useState(filters.dateFrom ?? '');
  const [customTo, setCustomTo] = useState(filters.dateTo ?? '');

  useEffect(() => {
    let ignore = false;

    getOrganizationsForFilter()
      .then((data) => {
        if (!ignore) {
          setOrgs(data);
        }
      })
      .catch(() => {});
    getProjectsForFilter(filters.organizationId)
      .then((data) => {
        if (!ignore) {
          setProjects(data);
        }
      })
      .catch(() => {});
    getUsersForFilter(filters.organizationId)
      .then((data) => {
        if (!ignore) {
          setUsers(data);
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [filters.organizationId]);

  const handlePeriodChange = (period: AiUsageFilters['period']) => {
    onChange({ ...filters, period, dateFrom: undefined, dateTo: undefined });
  };

  const handleCustomApply = () => {
    onChange({
      ...filters,
      period: 'custom',
      dateFrom: customFrom || undefined,
      dateTo: customTo || undefined,
    });
  };

  return (
    <div className="space-y-3">
      {/* Period toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground mr-1">Period:</span>
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => handlePeriodChange(p.value)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              filters.period === p.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-muted border-input'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {filters.period === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <button
            onClick={handleCustomApply}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground"
          >
            Apply
          </button>
        </div>
      )}

      {/* Dropdown filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Organization filter */}
        <select
          value={filters.organizationId ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              organizationId: e.target.value || undefined,
              projectPublicId: undefined,
              userId: undefined,
            })
          }
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm min-w-[180px]"
        >
          <option value="">All organizations</option>
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>

        {/* Project filter */}
        <select
          value={filters.projectPublicId ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              projectPublicId: e.target.value || undefined,
            })
          }
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm min-w-[180px]"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.publicId} value={p.publicId}>
              {p.title} ({p.orgName})
            </option>
          ))}
        </select>

        {/* User filter */}
        <select
          value={filters.userId ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              userId: e.target.value || undefined,
            })
          }
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm min-w-[180px]"
        >
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email}
            </option>
          ))}
        </select>

        {/* Step filter */}
        <select
          value={filters.step ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              step: (e.target.value as AiUsageStep) || undefined,
            })
          }
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm min-w-[150px]"
        >
          {STEPS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
