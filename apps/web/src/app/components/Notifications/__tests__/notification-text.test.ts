import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';

import { locales } from '@/app/config';
import type { NotificationDto } from '@/features/notifications/contracts/notification.types';
import {
  notificationText,
  type NotificationContentTranslator,
} from '../notification-text';

const messagesFor = async (locale: string) =>
  (await import(`@/app/messages/${locale}.json`)) as {
    default: Record<string, unknown>;
  };

const row = (
  type: NotificationDto['type'],
  metadata: unknown,
): Pick<NotificationDto, 'type' | 'metadata' | 'title' | 'body'> => ({
  type,
  metadata,
  title: 'stored title',
  body: 'stored body',
});

const CASES: [NotificationDto['type'], Record<string, unknown>, string][] = [
  [
    'DOCUMENT_SHARED',
    { resourceName: 'Pricing.pdf', resourceKind: 'file', sharedByName: 'Zed' },
    'Zed',
  ],
  ['DOCUMENT_SHARED', { resourceName: 'HR', resourceKind: 'folder' }, ''],
  ['PROJECT_SHARED', { projectName: 'Sales', sharedByName: 'Zed' }, 'Zed'],
  ['PROJECT_SHARED', { projectName: 'Sales' }, ''],
  [
    'THREAD_SHARED_NEW_MESSAGE',
    { threadTitle: 'Q3', sharedByName: 'Zed' },
    'Zed',
  ],
  ['THREAD_SHARED_NEW_MESSAGE', {}, ''],
  ['DOCUMENT_EMBEDDED', { documentName: 'Returns.pdf' }, 'Returns.pdf'],
];

/**
 * Every locale file, not only the two the component test renders: an ICU
 * syntax slip in one of the other thirteen would otherwise surface only to
 * that locale's readers, as a raw key or a thrown formatting error.
 */
describe.each(locales)('notification text in %s', (locale) => {
  const translator = async () => {
    const { default: messages } = await messagesFor(locale);
    const t = createTranslator({
      locale,
      messages,
      namespace: 'notifications.content',
      onError: (err) => {
        throw err;
      },
    });
    return t as unknown as NotificationContentTranslator;
  };

  it.each(CASES)('renders %s %j', async (type, metadata, mustContain) => {
    const t = await translator();
    const { title } = notificationText(row(type, metadata), t);
    expect(title).not.toBe('stored title');
    expect(title).not.toMatch(/[{}]|notifications\.content/);
    expect(title).toContain(mustContain);
  });

  it.each([0, 1, 2, 3, 5, 11, 22, 101])(
    'pluralises a Drive import of %i files',
    async (importedCount) => {
      const t = await translator();
      const { title, body } = notificationText(
        row('DRIVE_IMPORT_COMPLETED', { folderName: 'Specs', importedCount }),
        t,
      );
      expect(title).not.toMatch(/[{}]/);
      expect(body).toContain(String(importedCount));
      expect(body).toContain('Specs');
      expect(body).not.toMatch(/[{}#]/);
    },
  );

  it.each([0, 1, 2, 5, 22])(
    'pluralises an expiry in %i days',
    async (daysUntilExpiry) => {
      const t = await translator();
      const { title } = notificationText(
        row('DOCUMENT_EXPIRING', { documentName: 'Umowa', daysUntilExpiry }),
        t,
      );
      expect(title).toContain('Umowa');
      expect(title).not.toMatch(/[{}#]/);
      if (daysUntilExpiry > 1) {
        expect(title).toContain(String(daysUntilExpiry));
      }
    },
  );
});

describe('notificationText — the fallback', () => {
  const t: NotificationContentTranslator = () => {
    throw new Error('the translator must not be called for a fallback');
  };

  it.each([
    ['no metadata', row('DOCUMENT_SHARED', null)],
    ['undefined metadata', row('DOCUMENT_SHARED', undefined)],
    ['details of the wrong shape', row('PROJECT_SHARED', { name: 'Sales' })],
    [
      'an unknown type',
      row('SOMETHING_NEW' as NotificationDto['type'], { projectName: 'x' }),
    ],
  ])('returns the stored text for %s', (_label, notification) => {
    expect(notificationText(notification, t)).toEqual({
      title: 'stored title',
      body: 'stored body',
    });
  });
});
