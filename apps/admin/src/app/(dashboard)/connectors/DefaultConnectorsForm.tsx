'use client';

import { useState } from 'react';
import { saveDefaultAllowedConnectorsAction } from './actions';
import { allConnectors } from './connectors-config';

export function DefaultConnectorsForm({ defaults }: { defaults: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaults));
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const allSelected = selected.size === allConnectors.length;
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
      setSelected(new Set(allConnectors.map((c) => c.value)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    setError('');
    try {
      await saveDefaultAllowedConnectorsAction(Array.from(selected));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
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
          All connectors {noneSelected && '(no restriction)'}
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {allConnectors.map((connector) => (
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
        Empty selection means no restriction — all connectors are available.
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
