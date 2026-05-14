'use client';

import {
  DocumentArrowUpIcon,
  FolderArrowDownIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { useRouter } from '@/i18n/routing';
import { useTranslations, useLocale } from 'next-intl';
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
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TimeTranslator = (key: any, values?: any) => string;

const LOCALE_MAP: Record<string, string> = { pl: 'pl-PL', en: 'en-GB' };

function relativeTime(date: Date, t: TimeTranslator, locale: string): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) {
    return t('time.just-now');
  }
  if (minutes < 60) {
    return t('time.minutes-ago', { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t('time.hours-ago', { count: hours });
  }
  const resolvedLocale = LOCALE_MAP[locale] ?? locale;
  return d.toLocaleString(resolvedLocale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Props = {
  notification: NotificationDto;
  onRead: (publicId: string) => void;
};

export function NotificationItem({ notification, onRead }: Props) {
  const router = useRouter();
  const t = useTranslations('notifications');
  const locale = useLocale();
  const Icon = ICONS[notification.type];

  const handleClick = () => {
    onRead(notification.publicId);
    if (notification.resourceUrl) {
      router.push(
        notification.resourceUrl as Parameters<typeof router.push>[0],
      );
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
      data-testid="notification-item"
    >
      <span
        className={[
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
          notification.isRead
            ? 'bg-emerald-100 dark:bg-emerald-900/40'
            : 'bg-[#252d53] dark:bg-[#252d53]',
        ].join(' ')}
      >
        <Icon
          className={[
            'size-4',
            notification.isRead
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-white',
          ].join(' ')}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {notification.title}
          </span>
          {!notification.isRead && (
            <span
              className="size-2 shrink-0 rounded-full bg-[#cb1d3d]"
              aria-label={t('unread-aria')}
            />
          )}
        </span>
        {notification.body && (
          <span className="mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400">
            {notification.body}
          </span>
        )}
        <span className="mt-0.5 block text-xs text-zinc-400 dark:text-zinc-500">
          {relativeTime(notification.createdAt, t, locale)}
        </span>
      </span>
    </button>
  );
}
