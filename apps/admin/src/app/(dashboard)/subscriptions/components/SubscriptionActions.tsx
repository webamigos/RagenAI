'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MoreHorizontal,
  ArrowRightLeft,
  XCircle,
  RotateCcw,
  Users,
  RefreshCw,
} from 'lucide-react';
import {
  changePlanAction,
  cancelSubscriptionAction,
  reactivateSubscriptionAction,
  syncSeatsAction,
  updateSeatsAction,
} from '../actions';

interface Plan {
  id: string;
  name: string;
  priceId: string;
}

interface SubscriptionActionsProps {
  subscriptionId: string;
  currentPlan: string;
  currentSeats: number;
  cancelAtPeriodEnd: boolean;
  hasStripeId: boolean;
  plans: Plan[];
}

export function SubscriptionActions({
  subscriptionId,
  currentPlan,
  currentSeats,
  cancelAtPeriodEnd,
  hasStripeId,
  plans,
}: SubscriptionActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<'changePlan' | 'updateSeats' | null>(
    null,
  );
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const openMenu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        setMenuPos({
          top: rect.bottom + 4,
          right: window.innerWidth - rect.right,
        });
      }
      setMenuOpen(!menuOpen);
    },
    [menuOpen],
  );

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function handleClose(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClose);
    return () => document.removeEventListener('mousedown', handleClose);
  }, [menuOpen]);

  if (!hasStripeId) {
    return null;
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Subscription actions"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menuOpen && (
        <div
          className="fixed z-[100] w-52 rounded-md border border-border bg-popover py-1 shadow-lg"
          style={{ top: menuPos.top, right: menuPos.right }}
        >
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setDialog('changePlan');
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Change Plan
          </button>
          {cancelAtPeriodEnd ? (
            <button
              type="button"
              onClick={async () => {
                setMenuOpen(false);
                await reactivateSubscriptionAction(subscriptionId);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-green-600 transition-colors hover:bg-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reactivate
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                setMenuOpen(false);
                await cancelSubscriptionAction(subscriptionId);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive transition-colors hover:bg-accent"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel at Period End
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setDialog('updateSeats');
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <Users className="h-3.5 w-3.5" />
            Update Seats
          </button>
          <button
            type="button"
            onClick={async () => {
              setMenuOpen(false);
              await syncSeatsAction(subscriptionId);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync Seats from Members
          </button>
        </div>
      )}

      {dialog === 'changePlan' && (
        <ChangePlanDialog
          subscriptionId={subscriptionId}
          currentPlan={currentPlan}
          plans={plans}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'updateSeats' && (
        <UpdateSeatsDialog
          subscriptionId={subscriptionId}
          currentSeats={currentSeats}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function ChangePlanDialog({
  subscriptionId,
  currentPlan,
  plans,
  onClose,
}: {
  subscriptionId: string;
  currentPlan: string;
  plans: Plan[];
  onClose: () => void;
}) {
  const [selectedPriceId, setSelectedPriceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPriceId) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      await changePlanAction(subscriptionId, selectedPriceId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-popover p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-semibold">Change Plan</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Current plan: <span className="font-medium">{currentPlan}</span>.
          Proration will be applied.
        </p>
        <select
          value={selectedPriceId}
          onChange={(e) => setSelectedPriceId(e.target.value)}
          className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Select a plan...</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.priceId}>
              {plan.name} ({plan.priceId})
            </option>
          ))}
        </select>
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !selectedPriceId}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Change Plan'}
          </button>
        </div>
      </form>
    </div>
  );
}

function UpdateSeatsDialog({
  subscriptionId,
  currentSeats,
  onClose,
}: {
  subscriptionId: string;
  currentSeats: number;
  onClose: () => void;
}) {
  const [seats, setSeats] = useState(String(currentSeats));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(seats, 10);
    if (isNaN(num) || num < 1) {
      setError('Seats must be at least 1');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await updateSeatsAction(subscriptionId, num);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-popover p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-semibold">Update Seats</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Current seats: <span className="font-medium">{currentSeats}</span>.
          Proration will be applied.
        </p>
        <input
          type="number"
          min={1}
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
          className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Seats'}
          </button>
        </div>
      </form>
    </div>
  );
}
