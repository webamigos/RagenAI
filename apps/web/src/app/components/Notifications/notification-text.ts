import {
  parseNotificationDetails,
  type NotificationContent,
} from '@ragenai/platform-contracts';
import type { NotificationDto } from '@/features/notifications/contracts/notification.types';

/**
 * `useTranslations('notifications.content')`'s translator, narrowed to what
 * this file calls, so the function below stays pure and testable.
 */
export type NotificationContentTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export type NotificationText = { title: string; body: string | null };

/** "{name} shared …" when the sharer is known, the impersonal form when not. */
function sharedTitle(
  t: NotificationContentTranslator,
  prefix: string,
  sharedByName: string | undefined,
): string {
  return sharedByName
    ? t(`${prefix}.title-by`, { name: sharedByName })
    : t(`${prefix}.title`);
}

function fromContent(
  content: NotificationContent,
  t: NotificationContentTranslator,
): NotificationText {
  switch (content.type) {
    case 'DOCUMENT_SHARED': {
      const { resourceKind, resourceName, sharedByName } = content.details;
      const prefix =
        resourceKind === 'folder' ? 'folder-shared' : 'document-shared';
      return {
        title: sharedTitle(t, prefix, sharedByName),
        body: resourceName,
      };
    }
    case 'PROJECT_SHARED':
      return {
        title: sharedTitle(t, 'project-shared', content.details.sharedByName),
        body: content.details.projectName,
      };
    case 'THREAD_SHARED_NEW_MESSAGE':
      return {
        title: sharedTitle(t, 'thread-shared', content.details.sharedByName),
        body: content.details.threadTitle ?? null,
      };
    case 'DRIVE_IMPORT_COMPLETED':
      return {
        title: t('drive-import.title'),
        body: t('drive-import.body', {
          count: content.details.importedCount,
          folder: content.details.folderName,
        }),
      };
    case 'DOCUMENT_EMBEDDED':
      return {
        title: t('document-embedded.title', {
          name: content.details.documentName,
        }),
        body: null,
      };
    case 'DOCUMENT_EXPIRING':
      return {
        title: t('document-expiring.title', {
          name: content.details.documentName,
          days: content.details.daysUntilExpiry,
        }),
        body: null,
      };
  }
}

/**
 * A notification's title and body in the reader's locale.
 *
 * Rendered from the row's `type` and structured `metadata`. A row with no
 * details — everything written before notifications carried them — or with a
 * type or details this build does not know is shown with its stored `title`
 * and `body`, unchanged, so nothing turns blank.
 */
export function notificationText(
  notification: Pick<NotificationDto, 'type' | 'metadata' | 'title' | 'body'>,
  t: NotificationContentTranslator,
): NotificationText {
  const content = parseNotificationDetails(
    notification.type,
    notification.metadata,
  );
  if (!content) {
    return { title: notification.title, body: notification.body };
  }
  return fromContent(content, t);
}
