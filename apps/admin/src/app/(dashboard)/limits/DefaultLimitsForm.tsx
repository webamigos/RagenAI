'use client';

import { useState, useId } from 'react';
import { saveDefaultLimitsAction } from './actions';

interface DefaultLimits {
  storageLimitBytes: number | null;
  projectStorageLimitBytes: number | null;
  singleFileLimitBytes: number | null;
  monthlyTokenLimit: number | null;
  monthlyCostLimitCents: number | null;
  monthlyMessageLimit: number | null;
  maxMembers: number | null;
}

export function DefaultLimitsForm({ defaults }: { defaults: DefaultLimits }) {
  const [values, setValues] = useState({
    storageLimitMb: defaults.storageLimitBytes
      ? String(defaults.storageLimitBytes / (1024 * 1024))
      : '',
    projectStorageLimitMb: defaults.projectStorageLimitBytes
      ? String(defaults.projectStorageLimitBytes / (1024 * 1024))
      : '',
    singleFileLimitMb: defaults.singleFileLimitBytes
      ? String(defaults.singleFileLimitBytes / (1024 * 1024))
      : '',
    monthlyTokenLimit: defaults.monthlyTokenLimit
      ? String(defaults.monthlyTokenLimit)
      : '',
    monthlyCostLimitCents: defaults.monthlyCostLimitCents
      ? String(defaults.monthlyCostLimitCents / 100)
      : '',
    monthlyMessageLimit: defaults.monthlyMessageLimit
      ? String(defaults.monthlyMessageLimit)
      : '',
    maxMembers: defaults.maxMembers ? String(defaults.maxMembers) : '',
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
      await saveDefaultLimitsAction({
        storageLimitBytes: values.storageLimitMb
          ? Number(values.storageLimitMb) * 1024 * 1024
          : null,
        projectStorageLimitBytes: values.projectStorageLimitMb
          ? Number(values.projectStorageLimitMb) * 1024 * 1024
          : null,
        singleFileLimitBytes: values.singleFileLimitMb
          ? Number(values.singleFileLimitMb) * 1024 * 1024
          : null,
        monthlyTokenLimit: values.monthlyTokenLimit
          ? Number(values.monthlyTokenLimit)
          : null,
        monthlyCostLimitCents: values.monthlyCostLimitCents
          ? Math.round(Number(values.monthlyCostLimitCents) * 100)
          : null,
        monthlyMessageLimit: values.monthlyMessageLimit
          ? Number(values.monthlyMessageLimit)
          : null,
        maxMembers: values.maxMembers ? Number(values.maxMembers) : null,
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
          placeholder="e.g. 50"
        />
        <LimitField
          label="Project Storage Limit (MB)"
          value={values.projectStorageLimitMb}
          onChange={set('projectStorageLimitMb')}
          placeholder="e.g. 20"
        />
        <LimitField
          label="Single File Limit (MB)"
          value={values.singleFileLimitMb}
          onChange={set('singleFileLimitMb')}
          placeholder="e.g. 5"
        />
        <LimitField
          label="Monthly Token Limit"
          value={values.monthlyTokenLimit}
          onChange={set('monthlyTokenLimit')}
          placeholder="e.g. 1000000"
        />
        <LimitField
          label="Monthly Cost Limit ($)"
          value={values.monthlyCostLimitCents}
          onChange={set('monthlyCostLimitCents')}
          placeholder="e.g. 10.00"
          step="0.01"
        />
        <LimitField
          label="Monthly Message Limit"
          value={values.monthlyMessageLimit}
          onChange={set('monthlyMessageLimit')}
          placeholder="e.g. 500"
        />
        <LimitField
          label="Max Members"
          value={values.maxMembers}
          onChange={set('maxMembers')}
          placeholder="e.g. 10"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Leave empty for unlimited. These defaults apply to newly created
        organizations.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Defaults'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  );
}

function LimitField({
  label,
  value,
  onChange,
  placeholder,
  step,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        step={step}
        min={0}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
