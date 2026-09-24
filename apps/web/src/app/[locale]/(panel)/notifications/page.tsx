'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { BellIcon, CheckIcon } from '@heroicons/react/24/outline';
import { NotificationItem } from '@/app/components/Notifications/NotificationItem';
import { EmptyState } from '@ragenai/common-ui/EmptyState';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { statusToast } from '@/app/lib/utils/toast';
import { NOTIFICATIONS_READ_EVENT } from '@/app/lib/services/notifications/types';
import {
  getNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from '@/app/actions';
import type {
  NotificationDto,
  NotificationType,
} from '@/features/notifications/contracts/notification.types';

type Filter = NotificationType | 'ALL';

/**
 * Every notification type has a chip — `PROJECT_SHARED` had none, so shared
 * assistants could only be found under "All".
 */
const NOTIFICATION_FILTERS: { value: Filter; labelKey: string }[] = [
  { value: 'ALL', labelKey: 'filters.all' },
  { value: 'DOCUMENT_SHARED', labelKey: 'filters.document-shared' },
  { value: 'PROJECT_SHARED', labelKey: 'filters.project-shared' },
  { value: 'THREAD_SHARED_NEW_MESSAGE', labelKey: 'filters.thread-shared' },
  { value: 'DRIVE_IMPORT_COMPLETED', labelKey: 'filters.drive-import' },
  { value: 'DOCUMENT_EMBEDDED', labelKey: 'filters.document-embedded' },
  { value: 'DOCUMENT_EXPIRING', labelKey: 'filters.document-expiring' },
];

const PAGE_SIZE = 20;
/** The unread count is read as one page; past it the heading says "50+". */
const UNREAD_PAGE = 50;

function announceRead() {
  window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
}

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [unread, setUnread] = useState<{ count: number; more: boolean }>({
    count: 0,
    more: false,
  });
  // A response for a filter the user has already left must not land: chips
  // are clicked faster than apps/api answers, and the last one to arrive
  // used to win regardless of which was asked for last.
  const requestId = useRef(0);

  const fetchUnread = useCallback(async () => {
    const data = await getNotificationsAction({
      isRead: false,
      limit: UNREAD_PAGE,
    });
    if (!data.failed) {
      setUnread({ count: data.items.length, more: data.nextCursor !== null });
    }
  }, []);

  const fetchNotifications = useCallback(
    async (cursor?: string) => {
      const id = ++requestId.current;
      setLoading(true);
      setFailed(false);
      try {
        const data = await getNotificationsAction({
          type: filter !== 'ALL' ? filter : undefined,
          cursor,
          limit: PAGE_SIZE,
        });
        if (id !== requestId.current) {
          return;
        }
        if (data.failed) {
          setFailed(true);
          return;
        }
        setNotifications((prev) =>
          cursor ? [...prev, ...data.items] : data.items,
        );
        setNextCursor(data.nextCursor);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
        }
      }
    },
    [filter],
  );

  useEffect(() => {
    setNotifications([]);
    setNextCursor(null);
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    void fetchUnread();
  }, [fetchUnread]);

  const handleRead = useCallback(async (publicId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.publicId === publicId ? { ...n, isRead: true } : n)),
    );
    setUnread((prev) => ({ ...prev, count: Math.max(0, prev.count - 1) }));
    try {
      await markNotificationReadAction(publicId);
    } catch {
      // The row navigates away; the count is re-read rather than guessed.
    }
    announceRead();
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    const previous = notifications;
    const previousUnread = unread;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread({ count: 0, more: false });
    try {
      await markAllNotificationsReadAction();
      announceRead();
    } catch {
      setNotifications(previous);
      setUnread(previousUnread);
      statusToast().errorToast({ message: t('mark-read-error') });
    }
  }, [notifications, unread, t]);

  const unreadLabel = unread.more ? `${unread.count}+` : String(unread.count);
  const isEmpty = !loading && !failed && notifications.length === 0;
  const isFirstLoad = loading && notifications.length === 0;

  return (
    // `w-full min-w-0`, not `mx-auto max-w-2xl`: the panel caps content at
    // 1120px and left-aligns it (panel-ux-rules 2). The old centred 672px
    // column clipped the filter chips; and without `min-w-0` the page, a
    // flex child, grew to the width of its widest row at 375px and the whole
    // panel scrolled sideways.
    <div
      className="w-full min-w-0 max-w-[1120px]"
      data-testid="notifications-page"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="font-display text-xl font-semibold text-foreground">
            {t('title')}
          </h1>
          {unread.count > 0 && (
            <p
              className="truncate text-xs text-muted-foreground"
              data-testid="notifications-unread-count"
            >
              {t('unread-count', { count: unreadLabel })}
            </p>
          )}
        </div>
        {/*
          A real button, and only while there is something to mark. It was
          faint grey text that stayed on screen, disabled, with nothing unread.
        */}
        {unread.count > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleMarkAllRead()}
            data-testid="notifications-mark-all-read"
          >
            <CheckIcon className="size-4" aria-hidden="true" />
            {t('mark-all-read')}
          </Button>
        )}
      </div>

      {/* Chips wrap rather than scroll: a scrolled row hid the last two. */}
      <div
        role="group"
        aria-label={t('filters.label')}
        className="mb-4 flex flex-wrap gap-2"
        data-testid="notifications-filters"
      >
        {NOTIFICATION_FILTERS.map(({ value, labelKey }) => {
          const active = filter === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(value)}
              className={cn(
                'inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {t(labelKey as Parameters<typeof t>[0])}
            </button>
          );
        })}
      </div>

      <div
        className="overflow-hidden rounded-lg border border-border bg-card"
        aria-busy={loading}
      >
        {isFirstLoad && (
          <div role="status" data-testid="notifications-loading">
            <span className="sr-only">{t('loading')}</span>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                aria-hidden="true"
                className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <span className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
                <span className="flex-1 space-y-2 pt-1">
                  <span className="block h-3 w-2/3 animate-pulse rounded bg-muted" />
                  <span className="block h-3 w-24 animate-pulse rounded bg-muted" />
                </span>
              </div>
            ))}
          </div>
        )}

        {failed && notifications.length === 0 && (
          <EmptyState
            className="py-10"
            title={t('load-error')}
            description={t('load-error-description')}
            actions={[
              { label: t('retry'), onClick: () => void fetchNotifications() },
            ]}
          />
        )}

        {isEmpty &&
          (filter === 'ALL' ? (
            <EmptyState
              className="py-10"
              icon={<BellIcon className="size-6 text-muted-foreground" />}
              title={t('empty')}
              description={t('empty-description')}
            />
          ) : (
            <EmptyState
              className="py-10"
              icon={<BellIcon className="size-6 text-muted-foreground" />}
              title={t('empty-filtered')}
              description={t('empty-filtered-description')}
              actions={[
                { label: t('show-all'), onClick: () => setFilter('ALL') },
              ]}
            />
          ))}

        {notifications.length > 0 && (
          <ul
            className="divide-y divide-border"
            data-testid="notifications-list"
          >
            {notifications.map((n) => (
              <li key={n.publicId}>
                <NotificationItem
                  notification={n}
                  onRead={(id) => void handleRead(id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {failed && notifications.length > 0 && (
        <p role="alert" className="mt-3 text-sm text-foreground">
          {t('load-error')}{' '}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={() => void fetchNotifications(nextCursor ?? undefined)}
          >
            {t('retry')}
          </Button>
        </p>
      )}

      {nextCursor && !failed && (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => void fetchNotifications(nextCursor)}
            disabled={loading}
          >
            {loading ? t('loading') : t('load-more')}
          </Button>
        </div>
      )}
    </div>
  );
}
