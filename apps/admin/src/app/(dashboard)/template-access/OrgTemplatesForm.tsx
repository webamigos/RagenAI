'use client';

import { useState, useEffect, useRef } from 'react';
import { saveOrgAllowedTemplatesAction, type TemplateOption } from './actions';

export function OrgTemplatesForm({
  orgId,
  templates,
  current,
  appDefaults,
}: {
  orgId: string;
  templates: TemplateOption[];
  current: string[];
  appDefaults: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(current));
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Only show templates that are enabled at the app level
  const availableTemplates =
    appDefaults.length > 0
      ? templates.filter((t) => appDefaults.includes(t.id))
      : templates;

  const allSelected =
    availableTemplates.length > 0 &&
    availableTemplates.every((t) => selected.has(t.id));
  const noneSelected = selected.size === 0;

  const toggleTemplate = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(availableTemplates.map((t) => t.id)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    setError('');
    try {
      await saveOrgAllowedTemplatesAction(orgId, Array.from(selected));
      setSaved(true);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
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
          All assistants {noneSelected && '(inherits app defaults)'}
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {availableTemplates.map((template) => (
          <label
            key={template.id}
            className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.has(template.id)}
              onChange={() => toggleTemplate(template.id)}
              className="h-4 w-4 rounded border-input"
            />
            {template.iconUrl ? (
              <img
                src={template.iconUrl}
                alt=""
                className="size-5 shrink-0 rounded"
              />
            ) : null}
            <span className="text-sm">{template.name}</span>
          </label>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Empty selection inherits app-level defaults. Only app-enabled assistants
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
