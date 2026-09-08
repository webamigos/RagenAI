'use client';

import { useState, useTransition } from 'react';

import { setRegistrationEnabledAction } from '../registration-actions';

/**
 * The switch that decides whether strangers can create their own account.
 *
 * Deliberately explains the invitation exemption on the card rather than in a
 * tooltip: an administrator turning this off needs to know it does not break
 * the invitations they have already sent, or they will hesitate to turn it
 * off at all.
 */
export function RegistrationToggle({ enabled }: { enabled: boolean }) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setError(null);
    // Optimistic, then reconciled with what the server actually stored — so a
    // failed write cannot leave the switch showing a state the database does
    // not have.
    setIsEnabled(next);
    startTransition(async () => {
      try {
        const stored = await setRegistrationEnabledAction(next);
        setIsEnabled(stored);
      } catch {
        setIsEnabled(!next);
        setError('Could not save the change. Nothing was modified.');
      }
    });
  }

  return (
    <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Self-service registration
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            {isEnabled
              ? 'Anyone who can reach this installation can create an account and their own organization.'
              : 'Nobody can create their own account. People you invite can still accept and join — an invitation is not affected by this switch.'}
          </p>
          {error && (
            <p
              role="alert"
              className="mt-2 text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </p>
          )}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          aria-label="Self-service registration"
          disabled={isPending}
          onClick={() => toggle(!isEnabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:outline-zinc-100 ${
            isEnabled
              ? 'bg-zinc-900 dark:bg-zinc-100'
              : 'bg-zinc-200 dark:bg-zinc-700'
          }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow transition-transform dark:bg-zinc-900 ${
              isEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </section>
  );
}
