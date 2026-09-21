'use client';

import { useState } from 'react';
import { saveDefaultAllowedConnectorsAction } from './actions';

export type GrantableConnector = {
  value: string;
  label: string;
  icon: string | null;
  enabled: boolean;
};

/**
 * Whether the catalogue still carries this slug.
 *
 * Shared by both forms on this page, because both seed their selection from
 * stored values and both render controls from the catalogue — so both had the
 * same trap: a slug in one and not the other stays selected, invisible, and
 * fails the save.
 */
export function grantable(
  catalogue: GrantableConnector[],
  value: string,
): boolean {
  return catalogue.some((connector) => connector.value === value);
}

export function DefaultConnectorsForm({
  defaults,
  allConnectors,
}: {
  defaults: string[];
  /** The catalogue, so an entry added from /mcp-catalogue can be granted. */
  allConnectors: GrantableConnector[];
}) {
  // Narrowed to what the catalogue still carries. A stored slug whose entry
  // was deleted renders no control, so it could be neither seen nor cleared —
  // and the save action validates against the catalogue, so it silently
  // rejected every submission from this form until the row came back.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaults.filter((value) => grantable(allConnectors, value))),
  );
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
            {connector.icon ? (
              <img src={connector.icon} alt="" className="size-5 shrink-0" />
            ) : (
              // An entry an operator added may have no brand asset; an
              // `<img>` with no `src` renders as a broken image.
              <span className="size-5 shrink-0 rounded bg-muted" aria-hidden />
            )}
            <span className="text-sm">
              {connector.label}
              {connector.enabled ? null : (
                <span className="ml-2 text-xs text-muted-foreground">
                  disabled in the catalogue
                </span>
              )}
            </span>
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
