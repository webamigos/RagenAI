'use client';

import { useState } from 'react';
import { Mail, X } from 'lucide-react';

import { cancelInvitationAction, resendInvitationAction } from './actions';

/**
 * Resend can fail for reasons the reader needs to see — apps/web unreachable,
 * the internal secret missing, the invitation no longer pending — and none of
 * them is fixed by clicking again. So the outcome is rendered, not swallowed.
 */
export function InvitationActions({
  invitationId,
  email,
  status,
}: {
  invitationId: string;
  email: string;
  status: string;
}) {
  const [pending, setPending] = useState<'resend' | 'cancel' | null>(null);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Only a pending invitation can be resent or cancelled; the rest are history.
  if (status !== 'pending') {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const resend = async () => {
    setPending('resend');
    setMessage(null);
    try {
      const result = await resendInvitationAction(invitationId);
      setMessage(
        result.ok
          ? { kind: 'ok', text: `Sent to ${result.email}` }
          : { kind: 'error', text: result.reason },
      );
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Resend failed',
      });
    } finally {
      setPending(null);
    }
  };

  const cancel = async () => {
    setPending('cancel');
    setMessage(null);
    try {
      await cancelInvitationAction(invitationId);
      setConfirming(false);
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Cancel failed',
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={resend}
          disabled={pending !== null}
          title={`Resend the invitation to ${email}`}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Mail className="h-3 w-3" />
          {pending === 'resend' ? 'Sending…' : 'Resend'}
        </button>

        {confirming ? (
          <>
            <button
              type="button"
              onClick={cancel}
              disabled={pending !== null}
              className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground disabled:opacity-50"
            >
              {pending === 'cancel' ? 'Cancelling…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-input px-2 py-1 text-xs"
            >
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={pending !== null}
            title={`Cancel the invitation to ${email}`}
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs transition-colors hover:bg-accent hover:text-destructive disabled:opacity-50"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        )}
      </div>

      {message && (
        <span
          role="alert"
          className={`max-w-xs text-right text-xs ${
            message.kind === 'ok' ? 'text-muted-foreground' : 'text-destructive'
          }`}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
