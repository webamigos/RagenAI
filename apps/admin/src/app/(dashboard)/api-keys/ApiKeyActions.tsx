'use client';

import { useState } from 'react';
import { KeyRound, Power, Trash2 } from 'lucide-react';

import {
  deactivateApiKeyAction,
  reactivateApiKeyAction,
  revokeApiKeyAction,
} from './actions';

/**
 * Two controls, not one, because they are not the same decision.
 *
 * Deactivate is reversible and stops the key working immediately. Revoke
 * destroys the secret and cannot be undone — so it asks twice, and says what
 * it is about to do rather than just "Are you sure?".
 */
export function ApiKeyActions({
  apiKeyId,
  name,
  isActive,
  vaultConfigured,
}: {
  apiKeyId: string;
  name: string;
  isActive: boolean;
  vaultConfigured: boolean;
}) {
  const [pending, setPending] = useState<'toggle' | 'revoke' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  } | null>(null);

  const toggle = async () => {
    setPending('toggle');
    setMessage(null);
    try {
      if (isActive) {
        await deactivateApiKeyAction(apiKeyId);
      } else {
        await reactivateApiKeyAction(apiKeyId);
      }
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Something went wrong',
      });
    } finally {
      setPending(null);
    }
  };

  const revoke = async () => {
    setPending('revoke');
    setMessage(null);
    try {
      const result = await revokeApiKeyAction(apiKeyId);
      if (result.ok) {
        setConfirming(false);
      } else {
        setMessage({ kind: 'error', text: result.reason });
      }
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Revoke failed',
      });
    } finally {
      setPending(null);
    }
  };

  const toggleLabel = (() => {
    if (pending === 'toggle') {
      return 'Saving…';
    }
    return isActive ? 'Deactivate' : 'Reactivate';
  })();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          disabled={pending !== null}
          title={
            isActive
              ? `Deactivate ${name}. Reversible — the secret is kept.`
              : `Reactivate ${name}.`
          }
          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Power className="h-3 w-3" />
          {toggleLabel}
        </button>

        {confirming ? (
          <>
            <button
              type="button"
              onClick={revoke}
              disabled={pending !== null}
              className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground disabled:opacity-50"
            >
              {pending === 'revoke' ? 'Revoking…' : 'Destroy secret'}
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
            disabled={pending !== null || !vaultConfigured}
            title={
              vaultConfigured
                ? `Revoke ${name} permanently: deactivate it, then delete its secret from the vault.`
                : 'Revoking needs the token vault configured on this app. Deactivate works without it.'
            }
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs transition-colors hover:bg-accent hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            Revoke
          </button>
        )}
      </div>

      {confirming && (
        <span className="max-w-xs text-right text-xs text-muted-foreground">
          <KeyRound className="mr-1 inline h-3 w-3" />
          Permanent. The secret is destroyed and the key cannot be restored.
        </span>
      )}

      {message && (
        /**
         * Fixed rather than in the cell. These messages are sentences — an
         * unreachable vault, a key already in the requested state — and a
         * table cell has no width to wrap them in.
         */
        <div
          role="alert"
          className={`fixed bottom-4 right-4 z-[110] max-w-sm rounded-md border px-4 py-3 text-sm shadow-lg ${
            message.kind === 'ok'
              ? 'border-border bg-card text-foreground'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {message.text}
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="ml-3 underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
