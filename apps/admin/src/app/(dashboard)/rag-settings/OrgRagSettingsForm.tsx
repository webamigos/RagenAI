'use client';

import { useState, useEffect } from 'react';
import { saveOrgRagSettingsAction, type RagPipelineSettings } from './actions';

const toggleItems: {
  key: keyof RagPipelineSettings;
  label: string;
  description: string;
}[] = [
  {
    key: 'multiQueryEnabled',
    label: 'Multi-query expansion',
    description:
      'Generate alternative phrasings for broader document retrieval.',
  },
  {
    key: 'docSummariesEnabled',
    label: 'Document summaries',
    description:
      'Generate summaries at ingest time for improved search relevance.',
  },
  {
    key: 'contentModerationEnabled',
    label: 'Content moderation',
    description: 'Filter harmful content before processing queries.',
  },
  {
    key: 'rerankingEnabled',
    label: 'Reranking',
    description: 'Re-score retrieved documents using a cross-encoder model.',
  },
];

export function OrgRagSettingsForm({
  orgId,
  current,
}: {
  orgId: string;
  current: RagPipelineSettings;
}) {
  const [settings, setSettings] = useState<RagPipelineSettings>(current);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSettings(current);
    setSaved(false);
    setError('');
  }, [orgId, current]);

  const toggle = (key: keyof RagPipelineSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    setError('');
    try {
      await saveOrgRagSettingsAction(orgId, settings);
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
      <div className="space-y-3">
        {toggleItems.map((item) => (
          <label key={item.key} className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings[item.key]}
              onChange={() => toggle(item.key)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div>
              <span className="text-sm font-medium">{item.label}</span>
              <p className="text-xs text-muted-foreground">
                {item.description}
              </p>
            </div>
          </label>
        ))}
      </div>

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
