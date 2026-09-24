'use client';

import {
  DocumentArrowUpIcon,
  FolderArrowDownIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  FolderIcon,
} from '@heroicons/react/24/outline';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import type {
  NotificationDto,
  NotificationType,
} from '@/features/notifications/contracts/notification.types';

const ICONS: Record<NotificationType, React.ElementType> = {
  DOCUMENT_SHARED: DocumentArrowUpIcon,
  DRIVE_IMPORT_COMPLETED: FolderArrowDownIcon,
  DOCUMENT_EXPIRING: ClockIcon,
  THREAD_SHARED_NEW_MESSAGE: ChatBubbleLeftRightIcon,
  DOCUMENT_EMBEDDED: CheckCircleIcon,
  PROJECT_SHARED: FolderIcon,
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * Only an in-app path is followed. `resourceUrl` is written by the producers
 * (and by the secret-protected `user-push` route), so it is trusted today, but
 * an absolute or protocol-relative value would make a notification a way off
 * the site — and the row is a link a user clicks without reading the target.
 */
export function internalHref(resourceUrl: string | null): string | null {
  if (!resourceUrl) {
    return null;
  }
  if (!resourceUrl.startsWith('/') || resourceUrl.startsWith('//')) {
    return null;
  }
  return resourceUrl;
}

type Props = {
  notification: NotificationDto;
  onRead: (publicId: string) => void;
};

export function NotificationItem({ notification, onRead }: Props) {
  const t = useTranslations('notifications');
  const format = useFormatter();
  // `useNow` rather than `Date.now()` in render: it ticks, so "5 min ago" does
  // not freeze while the page stays open, and it is the value next-intl's
  // formatter compares against. The absolute date below goes through the
  // formatter too, which applies the configured `timeZone` — the same zone
  // the server renders with, so server and client print the same string
  // (`toLocaleString` without a `timeZone` used the browser's zone).
  const now = useNow({ updateInterval: MINUTE });
  const Icon = ICONS[notification.type];
  const createdAt = new Date(notification.createdAt);
  const age = now.getTime() - createdAt.getTime();
  const absolute = format.dateTime(createdAt, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  let when: string;
  if (age < MINUTE) {
    when = t('time.just-now');
  } else if (age < DAY) {
    when = format.relativeTime(createdAt, now);
  } else {
    when = absolute;
  }

  const unread = !notification.isRead;
  const href = internalHref(notification.resourceUrl);
  const handleClick = () => {
    if (unread) {
      onRead(notification.publicId);
    }
  };

  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          unread
            ? 'bg-accent text-accent-foreground'
            : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          data-testid="notification-title"
          className={cn(
            'block text-sm text-foreground sm:truncate',
            unread ? 'font-semibold' : 'font-normal',
          )}
        >
          {notification.title}
        </span>
        {notification.body && (
          <span className="mt-0.5 block text-xs text-muted-foreground sm:truncate">
            {notification.body}
          </span>
        )}
        <time
          dateTime={createdAt.toISOString()}
          title={absolute}
          className="mt-1 block text-xs tabular-nums text-muted-foreground"
          suppressHydrationWarning
        >
          {when}
        </time>
      </span>
      {/*
        Unread is a word, not only a dot (panel-ux-rules 27). It used to be a
        crimson dot with an `aria-label` on a bare <span>, which a screen
        reader does not announce, and crimson is not an unread colour
        (rule 16). Navy fill plus the label, and the bolder title above.
      */}
      {unread && (
        <span
          data-testid="notification-unread"
          className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground"
        >
          {t('unread-badge')}
        </span>
      )}
    </>
  );

  const rowClass =
    'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring';

  return href ? (
    <Link
      href={href as Parameters<typeof Link>[0]['href']}
      onClick={handleClick}
      className={rowClass}
      data-testid="notification-item"
      data-unread={unread || undefined}
    >
      {content}
    </Link>
  ) : (
    <button
      type="button"
      onClick={handleClick}
      className={rowClass}
      data-testid="notification-item"
      data-unread={unread || undefined}
    >
      {content}
    </button>
  );
}
