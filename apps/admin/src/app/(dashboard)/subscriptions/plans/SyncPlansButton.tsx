'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { syncPlansFromStripeAction } from './actions';

export function SyncPlansButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { synced } = await syncPlansFromStripeAction();
      setResult(`Synced ${synced} plan${synced !== 1 ? 's' : ''}`);
      setTimeout(() => setResult(null), 3000);
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {result && (
        <span className="text-sm text-muted-foreground">{result}</span>
      )}
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Syncing...' : 'Sync from Stripe'}
      </button>
    </div>
  );
}
