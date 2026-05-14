'use client';

import { useState } from 'react';
import {
  FEATURE_KEYS,
  savePlanFeaturesAction,
  type FeatureKey,
} from '../../features/actions';

const LABELS: Record<FeatureKey, string> = {
  inviteMembers: 'Invite members',
  publicChatbot: 'Public chatbot',
  apiAccess: 'API access',
  mcpConnectors: 'MCP connectors',
  customAssistantTemplates: 'Custom assistant templates',
};

type TriState = 'unset' | 'on' | 'off';

function toTriState(v: boolean | undefined): TriState {
  if (v === true) {return 'on';}
  if (v === false) {return 'off';}
  return 'unset';
}

function fromTriState(v: TriState): boolean | null {
  if (v === 'on') {return true;}
  if (v === 'off') {return false;}
  return null;
}

export function PlanFeaturesDialog({
  planId,
  planName,
  initial,
  onClose,
}: {
  planId: string;
  planName: string;
  initial: Record<string, boolean>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<FeatureKey, TriState>>(() => {
    const out = {} as Record<FeatureKey, TriState>;
    for (const key of FEATURE_KEYS) {
      out[key] = toTriState(initial[key]);
    }
    return out;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const features = {} as Record<FeatureKey, boolean | null>;
      for (const key of FEATURE_KEYS) {
        features[key] = fromTriState(values[key]);
      }
      await savePlanFeaturesAction(planId, features);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-popover p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-lg font-semibold">Plan features</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Editing <span className="font-medium">{planName}</span>.
          &quot;Unset&quot; means the feature falls back to the per-feature code
          default.
        </p>

        <div className="space-y-3">
          {FEATURE_KEYS.map((key) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="text-sm">{LABELS[key]}</span>
              <select
                value={values[key]}
                onChange={(e) =>
                  setValues({
                    ...values,
                    [key]: e.target.value as TriState,
                  })
                }
                className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="unset">Unset</option>
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
