'use client';
import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useState } from 'react';

type ConnectedApp = {
  consentId: string;
  clientId: string;
  name: string;
  referenceId: string | null;
  organizationName: string | null;
  assistantName: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
};
export function ConnectedApps({ locked = false }: { locked?: boolean }) {
  const t = useTranslations('connected-apps');
  const locale = useLocale();
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/auth/mcp/apps', { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Cannot load connections');
        setApps(await response.json());
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, []);
  async function disconnect(app: ConnectedApp) {
    setDisconnecting(app.clientId);
    setError(false);
    try {
      const response = await fetch('/api/auth/mcp/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ consentId: app.consentId }),
      });
      if (!response.ok) throw new Error('Cannot disconnect');
      setApps((current) =>
        current.filter((row) => row.clientId !== app.clientId),
      );
    } catch {
      setError(true);
    } finally {
      setDisconnecting(null);
    }
  }
  return (
    <section aria-labelledby="connected-apps-title">
      <h2
        id="connected-apps-title"
        className="text-base font-semibold text-foreground"
      >
        {t('title')}
      </h2>
      {loading && <p role="status">{t('loading')}</p>}
      {!loading && apps.length === 0 && (
        <p className="mt-4 text-sm">{t('empty')}</p>
      )}
      {!loading && apps.length > 0 && (
        <ul className="mt-4 space-y-4">
          {apps.map((app) => (
            <li
              key={app.clientId}
              className="flex items-center justify-between gap-4 rounded border p-4"
            >
              <div>
                <p className="font-medium">{app.name}</p>
                <p className="text-sm text-muted-foreground">
                  {app.organizationName ?? t('unavailable')}
                  {app.assistantName ? ` · ${app.assistantName}` : ''}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('lastUsed', {
                    date: app.lastUsedAt
                      ? new Date(app.lastUsedAt).toLocaleString(locale)
                      : t('never'),
                  })}
                </p>
              </div>
              <button
                type="button"
                disabled={locked || disconnecting !== null}
                onClick={() => disconnect(app)}
                className="rounded border px-3 py-2 disabled:opacity-50"
              >
                {disconnecting === app.clientId
                  ? t('disconnecting')
                  : t('disconnect')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{t('error')}</p>}
    </section>
  );
}
