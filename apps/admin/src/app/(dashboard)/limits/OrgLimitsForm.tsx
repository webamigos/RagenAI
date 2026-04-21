'use client';

import { useState } from 'react';
import { saveOrgLimitsAction } from './actions';

interface OrgLimitsValues {
  storageLimitMb: number | null;
  projectStorageLimitMb: number | null;
  singleFileLimitMb: number | null;
  monthlyTokenLimit: number | null;
  monthlyCostLimitCents: number | null;
  monthlyMessageLimit: number | null;
  monthlyApiRequestLimit: number | null;
  maxMembers: number | null;
}

export function OrgLimitsForm({
  orgId,
  current,
}: {
  orgId: string;
  current: OrgLimitsValues;
}) {
  const [values, setValues] = useState({
    storageLimitMb:
      current.storageLimitMb !== null ? String(current.storageLimitMb) : '',
    projectStorageLimitMb:
      current.projectStorageLimitMb !== null
        ? String(current.projectStorageLimitMb)
        : '',
    singleFileLimitMb:
      current.singleFileLimitMb !== null
        ? String(current.singleFileLimitMb)
        : '',
    monthlyTokenLimit:
      current.monthlyTokenLimit !== null
        ? String(current.monthlyTokenLimit)
        : '',
    monthlyCostLimitCents:
      current.monthlyCostLimitCents !== null
        ? String(current.monthlyCostLimitCents / 100)
        : '',
    monthlyMessageLimit:
      current.monthlyMessageLimit !== null
        ? String(current.monthlyMessageLimit)
        : '',
    monthlyApiRequestLimit:
      current.monthlyApiRequestLimit !== null
        ? String(current.monthlyApiRequestLimit)
        : '',
    maxMembers: current.maxMembers !== null ? String(current.maxMembers) : '',
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    setError('');
    try {
      const toNum = (v: string): number | null => {
        if (!v) {
          return null;
        }
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      await saveOrgLimitsAction(orgId, {
        storageLimitMb: toNum(values.storageLimitMb),
        projectStorageLimitMb: toNum(values.projectStorageLimitMb),
        singleFileLimitMb: toNum(values.singleFileLimitMb),
        monthlyTokenLimit: toNum(values.monthlyTokenLimit),
        monthlyCostLimitCents: values.monthlyCostLimitCents
          ? Math.round(Number(values.monthlyCostLimitCents) * 100) || null
          : null,
        monthlyMessageLimit: toNum(values.monthlyMessageLimit),
        monthlyApiRequestLimit: toNum(values.monthlyApiRequestLimit),
        maxMembers: toNum(values.maxMembers),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LimitField
          label="Storage Limit (MB)"
          value={values.storageLimitMb}
          onChange={set('storageLimitMb')}
        />
        <LimitField
          label="Project Storage Limit (MB)"
          value={values.projectStorageLimitMb}
          onChange={set('projectStorageLimitMb')}
        />
        <LimitField
          label="Single File Limit (MB)"
          value={values.singleFileLimitMb}
          onChange={set('singleFileLimitMb')}
        />
        <LimitField
          label="Monthly Token Limit"
          value={values.monthlyTokenLimit}
          onChange={set('monthlyTokenLimit')}
        />
        <LimitField
          label="Monthly Cost Limit ($)"
          value={values.monthlyCostLimitCents}
          onChange={set('monthlyCostLimitCents')}
          step="0.01"
        />
        <LimitField
          label="Monthly Message Limit"
          value={values.monthlyMessageLimit}
          onChange={set('monthlyMessageLimit')}
        />
        <LimitField
          label="Monthly API Request Limit"
          value={values.monthlyApiRequestLimit}
          onChange={set('monthlyApiRequestLimit')}
        />
        <LimitField
          label="Max Members"
          value={values.maxMembers}
          onChange={set('maxMembers')}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Leave empty for unlimited.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Limits'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </form>
  );
}

function LimitField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        onChange={onChange}
        step={step}
        min={0}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
