'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { SecurityEventRow } from '@/features/security/contracts/security-event.types';

type Props = {
  event: SecurityEventRow | null;
  onClose: () => void;
  onResolve: (publicId: string) => void;
  isResolving: boolean;
};

const DIALOG_TITLE_ID = 'security-event-dialog-title';

export function SecurityEventDetailDialog({
  event,
  onClose,
  onResolve,
  isResolving,
}: Props) {
  const t = useTranslations('settings-security');

  // Close on Escape when the dialog is open. Registered unconditionally
  // so React doesn't break the rules of hooks — the handler itself is
  // a no-op when `event` is null.
  useEffect(() => {
    if (!event) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [event, onClose]);

  if (!event) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={DIALOG_TITLE_ID}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 id={DIALOG_TITLE_ID} className="text-lg font-semibold">
              {event.eventType}
            </h3>
            <p className="text-xs text-muted-foreground">{event.publicId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('actions.close')}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">
              {t('columns.severity')}
            </dt>
            <dd className="font-medium">{t(`severity.${event.severity}`)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {t('detail.source')}
            </dt>
            <dd className="font-mono text-xs">{event.source}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {t('detail.occurredAt')}
            </dt>
            <dd>{new Date(event.createdAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {t('detail.user')}
            </dt>
            <dd className="font-mono text-xs">
              {event.user?.email ?? event.userId ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('detail.ip')}</dt>
            <dd className="font-mono text-xs">{event.ipAddress ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {t('detail.requestId')}
            </dt>
            <dd className="font-mono text-xs">{event.requestId ?? '—'}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <p className="mb-1 text-xs text-muted-foreground">
            {t('detail.metadata')}
          </p>
          <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs dark:bg-background">
            {JSON.stringify(event.metadata, null, 2)}
          </pre>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {event.resolvedAt ? (
              <>
                {t('detail.resolvedBy', { user: event.resolvedBy ?? '—' })} ·{' '}
                {new Date(event.resolvedAt).toLocaleString()}
              </>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted dark:hover:bg-card"
            >
              {t('actions.close')}
            </button>
            {!event.resolvedAt && (
              <button
                type="button"
                disabled={isResolving}
                onClick={() => onResolve(event.publicId)}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {isResolving ? t('actions.resolving') : t('actions.resolve')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
