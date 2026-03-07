'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { toast } from 'sonner';
import { Button } from '@ragenai/common-ui/Button';
import {
  getOrganizationsForFilter,
  getOrgUsageLimitsAction,
  updateOrgUsageLimitsAction,
  getDefaultLimitsAction,
  updateDefaultLimitsAction,
} from '../actions';

type OrgOption = { id: string; name: string };
type LimitsState = {
  monthlyTokenLimit: string;
  monthlyCostLimitCents: string;
  monthlyMessageLimit: string;
  maxMembers: string;
};
type CurrentUsage = {
  totalTokens: number;
  totalCostCents: number;
  totalMessages: number;
};
type ExceededState = {
  tokens: boolean;
  cost: boolean;
  messages: boolean;
};

export function AiUsageLimitsManager() {
  return (
    <div className="space-y-8">
      <DefaultLimitsSection />
      <hr className="border-border" />
      <OrgLimitsSection />
    </div>
  );
}

// --- Default Limits for New Organizations ---

type DefaultLimitsState = {
  storageLimitBytes: string;
  projectStorageLimitBytes: string;
  singleFileLimitBytes: string;
  monthlyTokenLimit: string;
  monthlyCostLimitCents: string;
  monthlyMessageLimit: string;
  maxMembers: string;
};

function DefaultLimitsSection() {
  const [limits, setLimits] = useState<DefaultLimitsState>({
    storageLimitBytes: '',
    projectStorageLimitBytes: '',
    singleFileLimitBytes: '',
    monthlyTokenLimit: '',
    monthlyCostLimitCents: '',
    monthlyMessageLimit: '',
    maxMembers: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getDefaultLimitsAction()
      .then((data) => {
        setLimits({
          storageLimitBytes: data.storageLimitBytes?.toString() ?? '',
          projectStorageLimitBytes:
            data.projectStorageLimitBytes?.toString() ?? '',
          singleFileLimitBytes: data.singleFileLimitBytes?.toString() ?? '',
          monthlyTokenLimit: data.monthlyTokenLimit?.toString() ?? '',
          monthlyCostLimitCents: data.monthlyCostLimitCents?.toString() ?? '',
          monthlyMessageLimit: data.monthlyMessageLimit?.toString() ?? '',
          maxMembers: data.maxMembers?.toString() ?? '',
        });
      })
      .catch(() => toast.error('Failed to load default limits'))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const parsed = {
        storageLimitBytes: limits.storageLimitBytes
          ? Number(limits.storageLimitBytes)
          : null,
        projectStorageLimitBytes: limits.projectStorageLimitBytes
          ? Number(limits.projectStorageLimitBytes)
          : null,
        singleFileLimitBytes: limits.singleFileLimitBytes
          ? Number(limits.singleFileLimitBytes)
          : null,
        monthlyTokenLimit: limits.monthlyTokenLimit
          ? Number(limits.monthlyTokenLimit)
          : null,
        monthlyCostLimitCents: limits.monthlyCostLimitCents
          ? Number(limits.monthlyCostLimitCents)
          : null,
        monthlyMessageLimit: limits.monthlyMessageLimit
          ? Number(limits.monthlyMessageLimit)
          : null,
        maxMembers: limits.maxMembers ? Number(limits.maxMembers) : null,
      };

      for (const [key, value] of Object.entries(parsed)) {
        if (value !== null && (!Number.isFinite(value) || value < 0)) {
          toast.error(
            `${key} must be a positive number or empty for unlimited`,
          );
          return;
        }
      }

      await updateDefaultLimitsAction(parsed);
      toast.success(
        'Default limits updated. These will apply to new organizations.',
      );
    } catch {
      toast.error('Failed to update default limits');
    } finally {
      setIsSaving(false);
    }
  };

  const bytesToMB = (bytes: string) => {
    if (!bytes) {
      return '';
    }
    return (Number(bytes) / (1024 * 1024)).toFixed(0);
  };

  const mbToBytes = (mb: string) => {
    if (!mb) {
      return '';
    }
    return (Number(mb) * 1024 * 1024).toString();
  };

  if (isLoading) {
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          Default Limits for New Organizations
        </h2>
        <div className="animate-pulse h-40 bg-muted rounded" />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">
        Default Limits for New Organizations
      </h2>
      <p className="text-sm text-muted-foreground">
        These limits are automatically applied when a new organization is
        created. Leave empty for unlimited. Changes here do not affect existing
        organizations.
      </p>

      <div className="border rounded-lg p-6 space-y-6">
        <div>
          <h3 className="text-sm font-semibold mb-3">Usage Limits</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <LimitInput
              label="Monthly Token Limit"
              placeholder="Unlimited"
              value={limits.monthlyTokenLimit}
              onChange={(v) =>
                setLimits((s) => ({ ...s, monthlyTokenLimit: v }))
              }
            />
            <LimitInput
              label="Monthly Cost Limit (cents)"
              placeholder="Unlimited"
              value={limits.monthlyCostLimitCents}
              onChange={(v) =>
                setLimits((s) => ({ ...s, monthlyCostLimitCents: v }))
              }
            />
            <LimitInput
              label="Monthly Message Limit"
              placeholder="Unlimited"
              value={limits.monthlyMessageLimit}
              onChange={(v) =>
                setLimits((s) => ({ ...s, monthlyMessageLimit: v }))
              }
            />
            <LimitInput
              label="Max Members"
              placeholder="Unlimited"
              value={limits.maxMembers}
              onChange={(v) => setLimits((s) => ({ ...s, maxMembers: v }))}
            />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3">Storage Limits</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <LimitInput
              label="Total Storage (MB)"
              placeholder="Default"
              value={bytesToMB(limits.storageLimitBytes)}
              onChange={(v) =>
                setLimits((s) => ({ ...s, storageLimitBytes: mbToBytes(v) }))
              }
            />
            <LimitInput
              label="Per-Project Storage (MB)"
              placeholder="Default"
              value={bytesToMB(limits.projectStorageLimitBytes)}
              onChange={(v) =>
                setLimits((s) => ({
                  ...s,
                  projectStorageLimitBytes: mbToBytes(v),
                }))
              }
            />
            <LimitInput
              label="Single File Limit (MB)"
              placeholder="Default"
              value={bytesToMB(limits.singleFileLimitBytes)}
              onChange={(v) =>
                setLimits((s) => ({ ...s, singleFileLimitBytes: mbToBytes(v) }))
              }
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} isLoading={isSaving}>
            Save Defaults
          </Button>
        </div>
      </div>
    </section>
  );
}

// --- Per-Organization Limits ---

function OrgLimitsSection() {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [limits, setLimits] = useState<LimitsState>({
    monthlyTokenLimit: '',
    monthlyCostLimitCents: '',
    monthlyMessageLimit: '',
    maxMembers: '',
  });
  const [current, setCurrent] = useState<CurrentUsage | null>(null);
  const [exceeded, setExceeded] = useState<ExceededState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getOrganizationsForFilter()
      .then(setOrgs)
      .catch(() => toast.error('Failed to load organizations'));
  }, []);

  const loadOrgLimits = useCallback(async (orgId: string) => {
    if (!orgId) {
      return;
    }
    setIsLoading(true);
    try {
      const data = await getOrgUsageLimitsAction(orgId);
      setLimits({
        monthlyTokenLimit: data.limits.monthlyTokenLimit?.toString() ?? '',
        monthlyCostLimitCents:
          data.limits.monthlyCostLimitCents?.toString() ?? '',
        monthlyMessageLimit: data.limits.monthlyMessageLimit?.toString() ?? '',
        maxMembers: data.limits.maxMembers?.toString() ?? '',
      });
      setCurrent(data.current);
      setExceeded(data.exceeded);
    } catch {
      toast.error('Failed to load usage limits');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleOrgChange = (orgId: string) => {
    setSelectedOrgId(orgId);
    if (orgId) {
      loadOrgLimits(orgId);
    } else {
      setCurrent(null);
      setExceeded(null);
    }
  };

  const handleSave = async () => {
    if (!selectedOrgId) {
      return;
    }
    setIsSaving(true);
    try {
      const tokenLimit = limits.monthlyTokenLimit
        ? Number(limits.monthlyTokenLimit)
        : null;
      const costLimit = limits.monthlyCostLimitCents
        ? Number(limits.monthlyCostLimitCents)
        : null;
      const messageLimit = limits.monthlyMessageLimit
        ? Number(limits.monthlyMessageLimit)
        : null;
      const maxMembers = limits.maxMembers ? Number(limits.maxMembers) : null;

      const values = { tokenLimit, costLimit, messageLimit, maxMembers };
      for (const [key, value] of Object.entries(values)) {
        if (value !== null && (!Number.isFinite(value) || value < 0)) {
          toast.error(
            `${key} must be a positive number or empty for unlimited`,
          );
          return;
        }
      }

      await updateOrgUsageLimitsAction(selectedOrgId, {
        monthlyTokenLimit: tokenLimit,
        monthlyCostLimitCents: costLimit,
        monthlyMessageLimit: messageLimit,
        maxMembers,
      });
      toast.success('Usage limits updated');
      await loadOrgLimits(selectedOrgId);
    } catch {
      toast.error('Failed to update usage limits');
    } finally {
      setIsSaving(false);
    }
  };

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) {
      return `${(n / 1_000_000).toFixed(2)}M`;
    }
    if (n >= 1_000) {
      return `${(n / 1_000).toFixed(1)}K`;
    }
    return n.toString();
  };

  const formatCostCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Organization Usage Limits</h2>
      <p className="text-sm text-muted-foreground">
        Set monthly limits per organization. Leave empty for unlimited. When a
        limit is reached, new chat messages will be blocked.
      </p>

      <select
        value={selectedOrgId}
        onChange={(e) => handleOrgChange(e.target.value)}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm min-w-[220px]"
        aria-label="Select an organization"
      >
        <option value="">Select an organization...</option>
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>

      {selectedOrgId && isLoading && (
        <div className="animate-pulse space-y-3">
          <div className="h-20 bg-muted rounded" />
        </div>
      )}

      {selectedOrgId && !isLoading && current && (
        <div className="border rounded-lg p-6 space-y-6">
          {/* Current month usage */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Current Month Usage</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <UsageCard
                label="Tokens"
                value={formatTokens(current.totalTokens)}
                limit={
                  limits.monthlyTokenLimit
                    ? formatTokens(Number(limits.monthlyTokenLimit))
                    : 'Unlimited'
                }
                exceeded={exceeded?.tokens ?? false}
              />
              <UsageCard
                label="Cost"
                value={formatCostCents(current.totalCostCents)}
                limit={
                  limits.monthlyCostLimitCents
                    ? formatCostCents(Number(limits.monthlyCostLimitCents))
                    : 'Unlimited'
                }
                exceeded={exceeded?.cost ?? false}
              />
              <UsageCard
                label="Messages"
                value={current.totalMessages.toLocaleString()}
                limit={limits.monthlyMessageLimit || 'Unlimited'}
                exceeded={exceeded?.messages ?? false}
              />
            </div>
          </div>

          {/* Edit limits */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Monthly Limits</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <LimitInput
                label="Token Limit"
                placeholder="Unlimited"
                value={limits.monthlyTokenLimit}
                onChange={(v) =>
                  setLimits((s) => ({ ...s, monthlyTokenLimit: v }))
                }
              />
              <LimitInput
                label="Cost Limit (cents)"
                placeholder="Unlimited"
                value={limits.monthlyCostLimitCents}
                onChange={(v) =>
                  setLimits((s) => ({ ...s, monthlyCostLimitCents: v }))
                }
              />
              <LimitInput
                label="Message Limit"
                placeholder="Unlimited"
                value={limits.monthlyMessageLimit}
                onChange={(v) =>
                  setLimits((s) => ({ ...s, monthlyMessageLimit: v }))
                }
              />
              <LimitInput
                label="Max Members"
                placeholder="Unlimited"
                value={limits.maxMembers}
                onChange={(v) => setLimits((s) => ({ ...s, maxMembers: v }))}
              />
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={handleSave} isLoading={isSaving}>
                Save Limits
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// --- Shared UI Components ---

function UsageCard({
  label,
  value,
  limit,
  exceeded,
}: {
  label: string;
  value: string;
  limit: string;
  exceeded: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${exceeded ? 'border-red-500 bg-red-50 dark:bg-red-950/20' : ''}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${exceeded ? 'text-red-600' : ''}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">
        Limit: {limit}
        {exceeded && (
          <span className="text-red-600 font-medium ml-1">Exceeded</span>
        )}
      </p>
    </div>
  );
}

function LimitInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-xs text-muted-foreground block mb-1">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}
