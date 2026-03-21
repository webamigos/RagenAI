'use client';

import { useState } from 'react';
import { saveOrgAllowedModelsAction } from './actions';
import { allModels, groupModelsByOrigin } from './models-config';

export function OrgModelsForm({
  orgId,
  current,
}: {
  orgId: string;
  current: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(current));
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const allSelected = selected.size === allModels.length;
  const noneSelected = selected.size === 0;

  const toggleModel = (value: string) => {
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
      setSelected(new Set(allModels.map((m) => m.value)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    setError('');
    try {
      await saveOrgAllowedModelsAction(orgId, Array.from(selected));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const grouped = groupModelsByOrigin(allModels);

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
          All models {noneSelected && '(no restriction)'}
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {grouped.map((group) => (
          <div key={group.origin}>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
              {group.displayName}
            </h4>
            <div className="space-y-1.5">
              {group.models.map((model) => (
                <label key={model.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(model.value)}
                    onChange={() => toggleModel(model.value)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="text-sm">{model.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Empty selection means no restriction — all models are allowed.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Models'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </form>
  );
}
