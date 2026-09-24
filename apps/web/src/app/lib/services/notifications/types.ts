export enum NotificationEvent {
  SUCCESS_EVENT = 'success-event',
  INFO_EVENT = 'info-event',
  ERROR_EVENT = 'error-event',
}

export type NotificationMessage = {
  content: string;
  intlKey: string;
  meta?: {
    forceRefresh?: boolean;
    redirectUrl?: string;
    messageLink?: string;
  };
};

export const NOTIFICATION_EVENT = 'notification';

/**
 * A same-tab DOM event the notifications page fires after it marks something
 * read, so the sidebar bell re-reads its unread count. The bell used to zero
 * itself while `/notifications` was open and never learn the truth again: it
 * showed 0 after you left with notifications still unread.
 */
export const NOTIFICATIONS_READ_EVENT = 'ragen:notifications-read';
