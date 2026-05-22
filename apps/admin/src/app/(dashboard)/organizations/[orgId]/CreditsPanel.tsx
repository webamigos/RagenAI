'use client';

import { useState } from 'react';
import { adjustOrgCreditsAction } from './credit-actions';

type LedgerEntry = {
  publicId: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  operation: string | null;
  note: string | null;
  userName: string | null;
  createdAt: string;
};

export function CreditsPanel({
  orgId,
  balance,
  lifetimeGranted,
  lifetimeSpent,
  ledger,
}: {
  orgId: string;
  balance: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  ledger: LedgerEntry[];
}) {
  const [direction, setDirection] = useState<'grant' | 'deduct'>('grant');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(amount, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a positive integer');
      return;
    }
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const signed = direction === 'grant' ? parsed : -parsed;
      await adjustOrgCreditsAction(orgId, signed, note || null);
      setSaved(true);
      setAmount('');
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Current balance" value={balance} highlight />
        <Stat label="Lifetime granted" value={lifetimeGranted} />
        <Stat label="Lifetime spent" value={lifetimeSpent} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="direction"
              className="mb-1 block text-xs font-medium"
            >
              Action
            </label>
            <select
              id="direction"
              value={direction}
              onChange={(e) =>
                setDirection(e.target.value as 'grant' | 'deduct')
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="grant">Grant credits</option>
              <option value="deduct">Deduct credits</option>
            </select>
          </div>
          <div>
            <label htmlFor="amount" className="mb-1 block text-xs font-medium">
              Amount
            </label>
            <input
              id="amount"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="note" className="mb-1 block text-xs font-medium">
              Note (optional)
            </label>
            <input
              id="note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="e.g. comp for outage"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && <p className="text-sm text-green-600">Saved.</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Apply adjustment'}
        </button>
      </form>

      <div>
        <h4 className="mb-3 text-sm font-semibold">Recent ledger entries</h4>
        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No ledger entries yet.
          </p>
        ) : (
          <div className="rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">When</th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                  <th className="px-3 py-2 text-left font-medium">Operation</th>
                  <th className="px-3 py-2 text-right font-medium">Delta</th>
                  <th className="px-3 py-2 text-right font-medium">After</th>
                  <th className="px-3 py-2 text-left font-medium">Actor</th>
                  <th className="px-3 py-2 text-left font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr
                    key={e.publicId}
                    className="border-b border-border last:border-0"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {e.createdAt}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                        {e.reason}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.operation ?? '—'}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${
                        e.delta < 0 ? 'text-destructive' : 'text-green-600'
                      }`}
                    >
                      {e.delta > 0 ? `+${e.delta}` : e.delta}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {e.balanceAfter}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.userName ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.note ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
