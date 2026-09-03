'use client';

import { useState } from 'react';

import { savePlatformFeatureDefaultsAction } from './actions';
import {
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  FEATURE_LABELS,
  type FeatureKey,
  type PlatformFeatureDefaults,
} from './feature-keys';

/**
 * The platform-wide layer from ADR-35.
 *
 * Same tri-state control as the per-organization form, one layer down: this
 * answers "what does this installation do by default", and a per-organization
 * override still wins over it. Each row names the built-in value it replaces,
 * because "Inherit" is only meaningful if the reader can see what it inherits.
 */

type TriState = 'inherit' | 'on' | 'off';

function toTriState(value: boolean | null | undefined): TriState {
  if (value === true) {
    return 'on';
  }
  if (value === false) {
    return 'off';
  }
  return 'inherit';
}

function fromTriState(value: TriState): boolean | null {
  if (value === 'on') {
    return true;
  }
  if (value === 'off') {
    return false;
  }
  return null;
}

export function PlatformFeaturesForm({
  current,
}: {
  current: PlatformFeatureDefaults;
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setSaved(false);
    setError('');
    try {
      const defaults: PlatformFeatureDefaults = {};
      for (const key of FEATURE_KEYS) {
        defaults[key] = fromTriState(values[key]);
      }
      await savePlatformFeatureDefaultsAction(defaults);
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
            className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border p-3"
          >
            <div>
              <p className="font-medium">{FEATURE_LABELS[key]}</p>
              <p className="text-xs text-muted-foreground">
                <code>{key}</code> · built-in default:{' '}
                {DEFAULT_FEATURES[key] ? 'on' : 'off'}
              </p>
            </div>
            <select
              value={values[key]}
              onChange={(event) =>
                setValues({
                  ...values,
                  [key]: event.target.value as TriState,
                })
              }
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="inherit">Use built-in default</option>
              <option value="on">On for this installation</option>
              <option value="off">Off for this installation</option>
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
          {loading ? 'Saving…' : 'Save platform defaults'}
        </button>
        {saved && (
          <span className="text-sm text-green-600">
            Saved. Read on every request, so it applies immediately.
          </span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  );
}
