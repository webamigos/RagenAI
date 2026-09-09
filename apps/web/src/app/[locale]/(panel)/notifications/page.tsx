'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { NotificationItem } from '@/app/components/Notifications/NotificationItem';
import {
  getNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from '@/app/actions';
import type {
  NotificationDto,
  NotificationType,
} from '@/features/notifications/contracts/notification.types';

const TYPE_KEYS: { value: NotificationType | 'ALL'; labelKey: string }[] = [
  { value: 'ALL', labelKey: 'filters.all' },
  { value: 'DOCUMENT_SHARED', labelKey: 'filters.document-shared' },
  { value: 'DRIVE_IMPORT_COMPLETED', labelKey: 'filters.drive-import' },
  { value: 'DOCUMENT_EXPIRING', labelKey: 'filters.document-expiring' },
  { value: 'THREAD_SHARED_NEW_MESSAGE', labelKey: 'filters.thread-shared' },
  { value: 'DOCUMENT_EMBEDDED', labelKey: 'filters.document-embedded' },
];

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<NotificationType | 'ALL'>('ALL');

  const fetchNotifications = useCallback(
    async (cursor?: string, reset = false) => {
      setLoading(true);
      try {
        const data = await getNotificationsAction({
          type: filter !== 'ALL' ? filter : undefined,
          cursor,
          limit: 20,
        });
        setNotifications((prev) =>
          reset ? data.items : [...prev, ...data.items],
        );
        setNextCursor(data.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    void fetchNotifications(undefined, true);
  }, [fetchNotifications]);

  const handleRead = useCallback(async (publicId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.publicId === publicId ? { ...n, isRead: true } : n)),
    );
    await markNotificationReadAction(publicId);
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllNotificationsReadAction();
  }, []);

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <button
          type="button"
          onClick={() => void handleMarkAllRead()}
          disabled={!hasUnread}
          className="text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('mark-all-read')}
        </button>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-3">
        {TYPE_KEYS.map(({ value, labelKey }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={[
              'shrink-0 rounded-full px-3 py-1 text-sm transition-colors',
              filter === value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground hover:bg-paper-200',
            ].join(' ')}
          >
            {t(labelKey as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      {loading && notifications.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('loading')}
        </p>
      )}

      {!loading && notifications.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </p>
      )}

      <div className="flex flex-col gap-1">
        {notifications.map((n) => (
          <NotificationItem
            key={n.publicId}
            notification={n}
            onRead={(id) => void handleRead(id)}
          />
        ))}
      </div>

      {nextCursor && (
        <button
          type="button"
          onClick={() => void fetchNotifications(nextCursor)}
          disabled={loading}
          className="mt-6 w-full rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {loading ? t('loading') : t('load-more')}
        </button>
      )}
    </div>
  );
}
