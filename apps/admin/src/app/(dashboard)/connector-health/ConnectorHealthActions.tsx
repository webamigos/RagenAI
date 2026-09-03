'use client';

import { useState } from 'react';
import { PlugZap } from 'lucide-react';

import { forceDisconnectConnectorAction } from './actions';

/**
 * One control, and it is destructive, so it confirms and says what it does.
 *
 * There is deliberately no "retry" button. A failing connector is already
 * retried on its own — `getEnabledConnectorsQuery` puts it back in the pool
 * fifteen minutes after the fault — so a retry control would either duplicate
 * that or lie about being immediate.
 */
export function ConnectorHealthActions({
  connectorId,
  provider,
  userLabel,
  vaultConfigured,
}: {
  connectorId: string;
  provider: string;
  userLabel: string;
  vaultConfigured: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const disconnect = async () => {
    setPending(true);
    setMessage(null);
    try {
      const result = await forceDisconnectConnectorAction(connectorId);
      if (result.ok) {
        setConfirming(false);
      } else {
        setMessage(result.reason);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Disconnect failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={disconnect}
            disabled={pending}
            className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground disabled:opacity-50"
          >
            {pending ? 'Disconnecting…' : 'Delete credential'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md border border-input px-2 py-1 text-xs"
          >
            Keep
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!vaultConfigured}
          title={
            vaultConfigured
              ? `Delete ${userLabel}'s ${provider} credential and remove the connector. They will have to connect again.`
              : 'Needs the token vault configured on this app — the credential lives there, not in Postgres.'
          }
          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs transition-colors hover:bg-accent hover:text-destructive disabled:opacity-50"
        >
          <PlugZap className="h-3 w-3" />
          Force reconnect
        </button>
      )}

      {confirming && (
        <span className="max-w-xs text-right text-xs text-muted-foreground">
          Deletes the stored credential. {userLabel} will be asked to connect{' '}
          {provider} again.
        </span>
      )}

      {message && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-[110] max-w-sm rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-lg"
        >
          {message}
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
