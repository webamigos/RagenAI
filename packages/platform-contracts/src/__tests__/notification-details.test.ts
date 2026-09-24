import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_TYPES,
  isNotificationType,
  notificationDetails,
  parseNotificationDetails,
} from '../notifications/notification-details';

describe('NOTIFICATION_TYPES', () => {
  // The list is hand-written because this package cannot import a generated
  // Prisma client. A type added to the enum and not here would parse as
  // "unknown" and render its fallback forever, so read the schema.
  it('is exactly the NotificationType enum in prisma/schema.prisma', () => {
    const schema = readFileSync(
      resolve(__dirname, '../../../../prisma/schema.prisma'),
      'utf8',
    );
    const block = /enum NotificationType \{([\s\S]*?)\}/.exec(schema)?.[1];
    expect(block).toBeDefined();
    const values = block!
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[A-Z_]+$/.test(l));
    expect([...values].sort()).toEqual([...NOTIFICATION_TYPES].sort());
  });

  it('isNotificationType accepts members only', () => {
    expect(isNotificationType('DOCUMENT_SHARED')).toBe(true);
    expect(isNotificationType('SOMETHING_NEW')).toBe(false);
    expect(isNotificationType(undefined)).toBe(false);
  });
});

describe('parseNotificationDetails — valid details', () => {
  it.each([
    [
      'DOCUMENT_SHARED',
      {
        resourceName: 'Pricing.pdf',
        resourceKind: 'file',
        sharedByName: 'Ann',
      },
    ],
    ['DOCUMENT_SHARED', { resourceName: 'HR', resourceKind: 'folder' }],
    ['PROJECT_SHARED', { projectName: 'Sales', sharedByName: 'Peter' }],
    ['PROJECT_SHARED', { projectName: 'Sales' }],
    ['THREAD_SHARED_NEW_MESSAGE', { threadTitle: 'Q3', sharedByName: 'Ann' }],
    ['THREAD_SHARED_NEW_MESSAGE', {}],
    [
      'DRIVE_IMPORT_COMPLETED',
      {
        folderName: 'Specs',
        importedCount: 3,
        skippedCount: 1,
        failedCount: 0,
      },
    ],
    ['DRIVE_IMPORT_COMPLETED', { folderName: 'Specs', importedCount: 0 }],
    ['DOCUMENT_EMBEDDED', { documentName: 'Returns.pdf' }],
    ['DOCUMENT_EXPIRING', { documentName: 'Contract.pdf', daysUntilExpiry: 0 }],
  ])('%s %j', (type, details) => {
    expect(parseNotificationDetails(type, details)).toEqual({ type, details });
  });

  it('drops null optional fields rather than carrying them', () => {
    expect(
      parseNotificationDetails('THREAD_SHARED_NEW_MESSAGE', {
        threadTitle: null,
        sharedByName: 'Ann',
      }),
    ).toEqual({
      type: 'THREAD_SHARED_NEW_MESSAGE',
      details: { sharedByName: 'Ann' },
    });
  });

  it('ignores keys the type does not use', () => {
    expect(
      parseNotificationDetails('DOCUMENT_EMBEDDED', {
        documentName: 'a.pdf',
        extra: 'x',
      }),
    ).toEqual({
      type: 'DOCUMENT_EMBEDDED',
      details: { documentName: 'a.pdf' },
    });
  });
});

describe('parseNotificationDetails — the fallback cases', () => {
  it.each([
    ['an unknown type', 'SOMETHING_NEW', { documentName: 'a' }],
    ['a row with no metadata', 'DOCUMENT_SHARED', null],
    ['metadata that is not an object', 'DOCUMENT_SHARED', 'Pricing.pdf'],
    ['metadata that is an array', 'DOCUMENT_SHARED', ['Pricing.pdf']],
    ['a missing required field', 'DOCUMENT_SHARED', { resourceKind: 'file' }],
    [
      'an unknown resource kind',
      'DOCUMENT_SHARED',
      { resourceName: 'x', resourceKind: 'drive' },
    ],
    ['an empty name', 'PROJECT_SHARED', { projectName: '  ' }],
    [
      'an empty optional name',
      'PROJECT_SHARED',
      { projectName: 'Sales', sharedByName: '' },
    ],
    [
      'a negative count',
      'DRIVE_IMPORT_COMPLETED',
      { folderName: 'x', importedCount: -1 },
    ],
    [
      'a fractional count',
      'DRIVE_IMPORT_COMPLETED',
      { folderName: 'x', importedCount: 1.5 },
    ],
    [
      'a count given as a string',
      'DRIVE_IMPORT_COMPLETED',
      { folderName: 'x', importedCount: '3' },
    ],
    [
      'a missing day count',
      'DOCUMENT_EXPIRING',
      { documentName: 'Contract.pdf' },
    ],
    [
      'a thread title that is not a string',
      'THREAD_SHARED_NEW_MESSAGE',
      { threadTitle: 5 },
    ],
  ])('returns null for %s', (_label, type, metadata) => {
    expect(parseNotificationDetails(type, metadata)).toBeNull();
  });
});

describe('notificationDetails — the producer side', () => {
  it('returns compacted details for a valid value', () => {
    expect(
      notificationDetails('DOCUMENT_SHARED', {
        resourceName: 'Pricing.pdf',
        resourceKind: 'file',
        sharedByName: undefined,
      }),
    ).toEqual({ resourceName: 'Pricing.pdf', resourceKind: 'file' });
  });

  it('returns undefined rather than throwing for an invalid value', () => {
    expect(
      notificationDetails('PROJECT_SHARED', { projectName: '' }),
    ).toBeUndefined();
  });
});
