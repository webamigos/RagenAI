'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { authClient } from '@/app/hooks/use-better-auth';
import { statusToast } from '@/app/lib/utils/toast';

type Session = {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function parseUserAgent(ua?: string | null): {
  browser: string;
  os: string;
} {
  if (!ua) {
    return { browser: 'Unknown', os: 'Unknown' };
  }

  // Browser detection
  let browser = 'Unknown';
  if (ua.includes('Edg/')) {
    browser = 'Edge';
  } else if (ua.includes('OPR/') || ua.includes('Opera')) {
    browser = 'Opera';
  } else if (ua.includes('Chrome/') && !ua.includes('Chromium/')) {
    browser = 'Chrome';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    browser = 'Safari';
  } else if (ua.includes('Firefox/')) {
    browser = 'Firefox';
  }

  // OS detection
  let os = 'Unknown';
  if (ua.includes('Windows')) {
    os = 'Windows';
  } else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) {
    os = 'macOS';
  } else if (ua.includes('Linux') && !ua.includes('Android')) {
    os = 'Linux';
  } else if (ua.includes('Android')) {
    os = 'Android';
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    os = 'iOS';
  }

  return { browser, os };
}

function formatDate(date: Date, locale: string): string {
  return new Date(date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Props = {
  /**
   * The shared demo account: the list stays visible, but revoking a session
   * would log a stranger out mid-demo, so the buttons are disabled. The auth
   * hook refuses the revoke as well.
   */
  locked?: boolean;
};

export function ActiveSessions({ locked = false }: Props) {
  const t = useTranslations('user-profile.sessions');
  const locale = useLocale();
  const { successToast, errorToast } = statusToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setError(false);
    try {
      const result = await authClient.listSessions();
      if (result.data) {
        setSessions(result.data as Session[]);
      }

      // Get current session to identify it
      const session = await authClient.getSession();
      if (session.data?.session) {
        setCurrentToken(session.data.session.token);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevokeSession = async (token: string) => {
    setRevokingId(token);
    try {
      await authClient.revokeSession({ token });
      successToast({ message: t('revoke-success') });
      await fetchSessions();
    } catch {
      errorToast({ message: t('revoke-error') });
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      await authClient.revokeSessions();
      successToast({ message: t('revoke-all-success') });
      // After revoking all, user will be logged out — redirect happens automatically
    } catch {
      errorToast({ message: t('revoke-all-error') });
    } finally {
      setRevokingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t('load-error')}
        </p>
        <button
          onClick={fetchSessions}
          className="shrink-0 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {locked && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {t('demo-account-locked')}
        </p>
      )}

      {/* Revoke all button */}
      {sessions.length > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('logout-all-description')}
          </p>
          <button
            onClick={handleRevokeAll}
            disabled={revokingAll || !!revokingId || locked}
            title={locked ? t('demo-account-locked') : undefined}
            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {revokingAll ? t('logging-out') : t('logout-all')}
          </button>
        </div>
      )}

      {/* Sessions list */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {sessions.map((session) => {
          const { browser, os } = parseUserAgent(session.userAgent);
          const isCurrent = session.token === currentToken;

          return (
            <div key={session.id} className="flex items-center gap-3 py-3">
              {/* Device icon */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <DeviceIcon os={os} />
              </div>

              {/* Session info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-950 dark:text-white">
                    {browser} ({os})
                  </span>
                  {isCurrent && (
                    <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      {t('current')}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                  {session.ipAddress && <span>{session.ipAddress} · </span>}
                  {t('last-active')} {formatDate(session.updatedAt, locale)}
                </div>
              </div>

              {/* Revoke button */}
              {!isCurrent && (
                <button
                  onClick={() => handleRevokeSession(session.token)}
                  disabled={
                    revokingId === session.token || revokingAll || locked
                  }
                  title={locked ? t('demo-account-locked') : undefined}
                  className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {revokingId === session.token ? t('revoking') : t('revoke')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeviceIcon({ os }: { os: string }) {
  if (os === 'iOS' || os === 'Android') {
    return (
      <svg
        className="h-4 w-4 text-zinc-500 dark:text-zinc-400"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path d="M8 16.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z" />
        <path
          fillRule="evenodd"
          d="M4 4a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V4Zm3-1.5A1.5 1.5 0 0 0 5.5 4v12A1.5 1.5 0 0 0 7 17.5h6a1.5 1.5 0 0 0 1.5-1.5V4A1.5 1.5 0 0 0 13 2.5H7Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg
      className="h-4 w-4 text-zinc-500 dark:text-zinc-400"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15h-3.105a3.501 3.501 0 0 0 1.1 1.677A.75.75 0 0 1 13.26 18H6.74a.75.75 0 0 1-.484-1.323A3.501 3.501 0 0 0 7.355 15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Zm1.5 0a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75v-7.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
