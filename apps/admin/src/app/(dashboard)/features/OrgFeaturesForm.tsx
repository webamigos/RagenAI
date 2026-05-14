'use client';

import { useState } from 'react';
import { saveOrgFeatureOverridesAction } from './actions';
import {
  FEATURE_KEYS,
  type FeatureKey,
  type FeatureOverrides,
} from './feature-keys';

const FEATURE_LABELS: Record<FeatureKey, string> = {
  inviteMembers: 'Invite members',
  publicChatbot: 'Public chatbot',
  apiAccess: 'API access',
  mcpConnectors: 'MCP connectors',
  customAssistantTemplates: 'Custom assistant templates',
};

type TriState = 'inherit' | 'on' | 'off';

function toTriState(v: boolean | null | undefined): TriState {
  if (v === true) {
    return 'on';
  }
  if (v === false) {
    return 'off';
  }
  return 'inherit';
}

function fromTriState(v: TriState): boolean | null {
  if (v === 'on') {
    return true;
  }
  if (v === 'off') {
    return false;
  }
  return null;
}

export function OrgFeaturesForm({
  orgId,
  current,
}: {
  orgId: string;
  current: FeatureOverrides;
}) {
  const [values, setValues] = useState<Record<FeatureKey, TriState>>(() => {
    const initial = {} as Record<FeatureKey, TriState>;
    for (const key of FEATURE_KEYS) {
      initial[key] = toTriState(current[key]);
    }
    return initial;
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
      const overrides: FeatureOverrides = {};
      for (const key of FEATURE_KEYS) {
        overrides[key] = fromTriState(values[key]);
      }
      await saveOrgFeatureOverridesAction(orgId, overrides);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        {FEATURE_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
          >
            <div>
              <p className="font-medium">{FEATURE_LABELS[key]}</p>
              <p className="text-xs text-muted-foreground">
                Key: <code>{key}</code>
              </p>
            </div>
            <select
              value={values[key]}
              onChange={(e) =>
                setValues({
                  ...values,
                  [key]: e.target.value as TriState,
                })
              }
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="inherit">Inherit (plan / default)</option>
              <option value="on">Force on</option>
              <option value="off">Force off</option>
            </select>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save overrides'}
        </button>
        {saved && (
          <span className="text-sm text-green-600">Saved successfully</span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  );
}
