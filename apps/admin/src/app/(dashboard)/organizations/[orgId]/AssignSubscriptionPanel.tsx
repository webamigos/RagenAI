'use client';

import { useState } from 'react';
import {
  assignSubscriptionAction,
  removeSubscriptionAction,
} from '../../subscriptions/actions';

type Plan = { id: string; name: string };

export function AssignSubscriptionPanel({
  orgId,
  plans,
  currentPlanName,
  currentSeats,
  hasStripeSub,
}: {
  orgId: string;
  plans: Plan[];
  currentPlanName: string | null;
  currentSeats: number | null;
  hasStripeSub: boolean;
}) {
  const [planId, setPlanId] = useState('');
  const [seats, setSeats] = useState(String(currentSeats ?? 10));
  const [periodEndAt, setPeriodEndAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  if (hasStripeSub) {
    return (
      <p className="text-sm text-muted-foreground">
        This org has a Stripe-backed subscription. Cancel via Stripe or the
        Subscriptions page before assigning a manual plan.
      </p>
    );
  }

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planId) {
      return;
    }
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const seatsNum = parseInt(seats, 10);
      await assignSubscriptionAction(orgId, planId, {
        seats: Number.isFinite(seatsNum) ? seatsNum : 1,
        periodEndAt: periodEndAt || null,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (
      !confirm(
        'Remove this org’s manual subscription? It returns to no-subscription state.',
      )
    ) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      await removeSubscriptionAction(orgId);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleAssign} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Current plan:{' '}
        <span className="font-medium text-foreground">
          {currentPlanName ?? 'none'}
        </span>
      </p>

      <div>
        <label htmlFor="planId" className="mb-1 block text-xs font-medium">
          Plan
        </label>
        <select
          id="planId"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Select a plan...</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="seats" className="mb-1 block text-xs font-medium">
            Seats
          </label>
          <input
            id="seats"
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label
            htmlFor="periodEndAt"
            className="mb-1 block text-xs font-medium"
          >
            Period end (optional)
          </label>
          <input
            id="periodEndAt"
            type="date"
            value={periodEndAt}
            onChange={(e) => setPeriodEndAt(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved.</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !planId}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {(() => {
            if (loading) {
              return 'Saving...';
            }
            return currentPlanName ? 'Update plan' : 'Assign plan';
          })()}
        </button>
        {currentPlanName && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={loading}
            className="rounded-md border border-destructive px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Remove subscription
          </button>
        )}
      </div>
    </form>
  );
}
