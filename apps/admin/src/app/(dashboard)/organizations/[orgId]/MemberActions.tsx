'use client';

import { useState } from 'react';
import { UserMinus, UserPlus, ChevronDown } from 'lucide-react';

import {
  addOrgMemberAction,
  changeOrgMemberRoleAction,
  removeOrgMemberAction,
} from '../actions';

const ROLES = ['owner', 'admin', 'member'] as const;

/**
 * Errors from these actions are the point of the UI, not an edge case: the
 * server refuses to remove or demote the last owner, and refuses to add an
 * address with no account. Each of those needs to reach the reader as a
 * sentence, because none of them is recoverable by retrying.
 */
function useActionState() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  };

  return { pending, error, setError, run };
}

function ErrorBanner({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) {
  return (
    <p
      role="alert"
      className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error}
      <button type="button" onClick={onDismiss} className="ml-3 underline">
        Dismiss
      </button>
    </p>
  );
}

export function AddMemberForm({ orgId }: { orgId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('member');
  const [added, setAdded] = useState<string | null>(null);
  const { pending, error, setError, run } = useActionState();

  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setAdded(null);
        await run(async () => {
          await addOrgMemberAction(orgId, email, role);
          setAdded(email.trim());
          setEmail('');
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="existing account e-mail"
          className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          value={role}
          onChange={(event) =>
            setRole(event.target.value as (typeof ROLES)[number])
          }
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {ROLES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          {pending ? 'Adding…' : 'Add member'}
        </button>
      </div>

      {/* The account must already exist — this panel does not create them. */}
      <p className="text-xs text-muted-foreground">
        The person needs an account already. Adding them here joins every team
        in the organization, so their LiteLLM usage is attributed correctly.
      </p>

      {added && (
        <p className="text-sm text-muted-foreground">
          Added <span className="font-medium text-foreground">{added}</span>.
        </p>
      )}
      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
    </form>
  );
}

export function MemberRowActions({
  orgId,
  userId,
  email,
  role,
}: {
  orgId: string;
  userId: string;
  email: string;
  role: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const { pending, error, setError, run } = useActionState();

  return (
    <div className="flex items-center justify-end gap-2">
      <div className="relative">
        <select
          value={role}
          disabled={pending}
          onChange={(event) =>
            run(() =>
              changeOrgMemberRoleAction(orgId, userId, event.target.value),
            )
          }
          aria-label={`Organization role for ${email}`}
          className="appearance-none rounded-md border border-input bg-background py-1 pl-2 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          {ROLES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1.5 h-3 w-3 text-muted-foreground" />
      </div>

      {confirming ? (
        <span className="flex items-center gap-1 text-xs">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await removeOrgMemberAction(orgId, userId);
                setConfirming(false);
              })
            }
            className="rounded-md bg-destructive px-2 py-1 font-medium text-destructive-foreground disabled:opacity-50"
          >
            {pending ? 'Removing…' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md border border-input px-2 py-1"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          title={`Remove ${email} from this organization`}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
        >
          <UserMinus className="h-4 w-4" />
        </button>
      )}

      {error && (
        // A button, not a span with onClick: the dismissal has to be reachable
        // from the keyboard, and this is the only way the last-owner refusal
        // gets off the screen.
        <button
          type="button"
          role="alert"
          onClick={() => setError(null)}
          title="Dismiss"
          className="max-w-xs text-left text-xs text-destructive underline"
        >
          {error}
        </button>
      )}
    </div>
  );
}
