'use client';

import { useState, useEffect, useRef } from 'react';
import { saveOrgAllowedConnectorsAction } from './actions';
import { allConnectors } from './connectors-config';

export function OrgConnectorsForm({
  orgId,
  current,
  appDefaults,
}: {
  orgId: string;
  current: string[];
  appDefaults: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(current));
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Only show connectors that are enabled at the app level
  const availableConnectors =
    appDefaults.length > 0
      ? allConnectors.filter((c) => appDefaults.includes(c.value))
      : allConnectors;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const allSelected =
    availableConnectors.length > 0 &&
    availableConnectors.every((c) => selected.has(c.value));
  const noneSelected = selected.size === 0;

  const toggleConnector = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(availableConnectors.map((c) => c.value)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    setError('');
    try {
      await saveOrgAllowedConnectorsAction(orgId, Array.from(selected));
      setSaved(true);
      timerRef.current = setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="h-4 w-4 rounded border-input"
        />
        <span className="text-sm font-medium">
          All connectors {noneSelected && '(inherits app defaults)'}
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {availableConnectors.map((connector) => (
          <label
            key={connector.value}
            className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.has(connector.value)}
              onChange={() => toggleConnector(connector.value)}
              className="h-4 w-4 rounded border-input"
            />
            <img src={connector.icon} alt="" className="size-5 shrink-0" />
            <span className="text-sm">{connector.label}</span>
          </label>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Empty selection inherits app-level defaults. Only app-enabled connectors
        are shown.
      </p>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  );
}
