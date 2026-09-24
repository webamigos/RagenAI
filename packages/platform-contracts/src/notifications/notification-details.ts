/**
 * What a notification says, as data rather than as a sentence.
 *
 * Notifications used to be written with a finished Polish `title` and `body`,
 * so an English reader saw Polish on the notifications page. A producer now
 * writes the notification's `type` plus these details into the `metadata`
 * column, and apps/web renders the sentence in the reader's locale. The
 * stored `title`/`body` stay, in English, as the fallback for rows written
 * before this contract and for any reader that does not render them itself.
 *
 * Shared (ADR-33) because the producers live in apps/api and apps/web, the
 * renderer in apps/web, and a detail one side writes under a name the other
 * does not read is a notification that silently falls back.
 *
 * Hand-written rather than Zod: this package has no runtime dependencies,
 * and the validator is a handful of field checks.
 */

/** Mirrors the `NotificationType` enum in prisma/schema.prisma. */
export const NOTIFICATION_TYPES = [
  'DOCUMENT_SHARED',
  'DRIVE_IMPORT_COMPLETED',
  'DOCUMENT_EXPIRING',
  'THREAD_SHARED_NEW_MESSAGE',
  'DOCUMENT_EMBEDDED',
  'PROJECT_SHARED',
] as const;

export type NotificationTypeName = (typeof NOTIFICATION_TYPES)[number];

export type DocumentSharedDetails = {
  /** The file's or the folder's name. */
  resourceName: string;
  resourceKind: 'file' | 'folder';
  /** Display name of whoever shared it; absent when it could not be read. */
  sharedByName?: string;
};

export type ProjectSharedDetails = {
  projectName: string;
  sharedByName?: string;
};

export type ThreadSharedDetails = {
  /** A thread may have no title yet. */
  threadTitle?: string;
  sharedByName?: string;
};

export type DriveImportCompletedDetails = {
  folderName: string;
  importedCount: number;
  skippedCount?: number;
  failedCount?: number;
};

export type DocumentEmbeddedDetails = {
  documentName: string;
};

export type DocumentExpiringDetails = {
  documentName: string;
  /** Whole days; 0 means it expires today. */
  daysUntilExpiry: number;
};

export type NotificationDetailsByType = {
  DOCUMENT_SHARED: DocumentSharedDetails;
  PROJECT_SHARED: ProjectSharedDetails;
  THREAD_SHARED_NEW_MESSAGE: ThreadSharedDetails;
  DRIVE_IMPORT_COMPLETED: DriveImportCompletedDetails;
  DOCUMENT_EMBEDDED: DocumentEmbeddedDetails;
  DOCUMENT_EXPIRING: DocumentExpiringDetails;
};

/** A notification's type with the details that type carries. */
export type NotificationContent = {
  [T in NotificationTypeName]: {
    type: T;
    details: NotificationDetailsByType[T];
  };
}[NotificationTypeName];

type Validator<T> = (value: Record<string, unknown>) => T | null;

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** An optional field: absent is fine, present must pass `check`. */
const optional = (v: unknown, check: (x: unknown) => boolean): boolean =>
  v === undefined || v === null || check(v);

/** Drops `undefined`/`null` so a parsed value has no keys it does not use. */
function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null),
  ) as T;
}

const VALIDATORS: {
  [T in NotificationTypeName]: Validator<NotificationDetailsByType[T]>;
} = {
  DOCUMENT_SHARED: (v) =>
    isNonEmptyString(v.resourceName) &&
    (v.resourceKind === 'file' || v.resourceKind === 'folder') &&
    optional(v.sharedByName, isNonEmptyString)
      ? compact({
          resourceName: v.resourceName,
          resourceKind: v.resourceKind as DocumentSharedDetails['resourceKind'],
          sharedByName: v.sharedByName as string | undefined,
        })
      : null,
  PROJECT_SHARED: (v) =>
    isNonEmptyString(v.projectName) &&
    optional(v.sharedByName, isNonEmptyString)
      ? compact({
          projectName: v.projectName,
          sharedByName: v.sharedByName as string | undefined,
        })
      : null,
  THREAD_SHARED_NEW_MESSAGE: (v) =>
    optional(v.threadTitle, isNonEmptyString) &&
    optional(v.sharedByName, isNonEmptyString)
      ? compact({
          threadTitle: v.threadTitle as string | undefined,
          sharedByName: v.sharedByName as string | undefined,
        })
      : null,
  DRIVE_IMPORT_COMPLETED: (v) =>
    isNonEmptyString(v.folderName) &&
    isCount(v.importedCount) &&
    optional(v.skippedCount, isCount) &&
    optional(v.failedCount, isCount)
      ? compact({
          folderName: v.folderName,
          importedCount: v.importedCount,
          skippedCount: v.skippedCount as number | undefined,
          failedCount: v.failedCount as number | undefined,
        })
      : null,
  DOCUMENT_EMBEDDED: (v) =>
    isNonEmptyString(v.documentName) ? { documentName: v.documentName } : null,
  DOCUMENT_EXPIRING: (v) =>
    isNonEmptyString(v.documentName) && isCount(v.daysUntilExpiry)
      ? { documentName: v.documentName, daysUntilExpiry: v.daysUntilExpiry }
      : null,
};

export function isNotificationType(
  value: unknown,
): value is NotificationTypeName {
  return (
    typeof value === 'string' &&
    (NOTIFICATION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Reads a stored notification's details. Returns `null` — render the stored
 * `title`/`body` instead — for an unknown type, a row with no metadata (every
 * notification written before this contract), or details that do not match
 * the type. Never throws: a malformed row must not take the page down.
 */
export function parseNotificationDetails(
  type: unknown,
  metadata: unknown,
): NotificationContent | null {
  if (!isNotificationType(type)) {
    return null;
  }
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    Array.isArray(metadata)
  ) {
    return null;
  }
  const details = VALIDATORS[type](metadata as Record<string, unknown>);
  if (!details) {
    return null;
  }
  return { type, details } as NotificationContent;
}

/**
 * The producer's side: checks the details against the type before they are
 * written. Returns the details, compacted, or `undefined` when they do not
 * match — the row is then written with its fallback text only. It does not
 * throw: a notification is a side-effect of a share or an import, and a bad
 * detail must not fail the operation that produced it.
 */
export function notificationDetails<T extends NotificationTypeName>(
  type: T,
  details: NotificationDetailsByType[T],
): NotificationDetailsByType[T] | undefined {
  const parsed = VALIDATORS[type](details as Record<string, unknown>);
  return parsed ? (parsed as NotificationDetailsByType[T]) : undefined;
}
