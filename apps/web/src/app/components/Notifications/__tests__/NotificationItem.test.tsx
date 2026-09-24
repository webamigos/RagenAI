import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import pl from '@/app/messages/pl.json';
import en from '@/app/messages/en.json';
import type { NotificationDto } from '@/features/notifications/contracts/notification.types';

vi.mock('@/i18n/routing', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { NotificationItem, internalHref } from '../NotificationItem';

const NOW = new Date('2026-09-24T12:00:00Z');

function notification(
  overrides: Partial<NotificationDto> = {},
): NotificationDto {
  return {
    publicId: 'n1',
    type: 'DOCUMENT_SHARED',
    isRead: false,
    title: 'Anna shared "HR" with you',
    body: 'HR',
    resourceUrl: '/knowledge/documents-list',
    createdAt: new Date('2026-09-24T11:55:00Z'),
    ...overrides,
  };
}

function renderItem(
  n: NotificationDto,
  {
    onRead = vi.fn(),
    locale = 'pl',
    timeZone = 'Europe/Warsaw',
  }: {
    onRead?: (id: string) => void;
    locale?: 'pl' | 'en';
    timeZone?: string;
  } = {},
) {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'pl' ? pl : en}
      timeZone={timeZone}
      now={NOW}
    >
      <NotificationItem notification={n} onRead={onRead} />
    </NextIntlClientProvider>,
  );
  return { onRead };
}

describe('NotificationItem — unread state', () => {
  it('says "unread" in words, not only with a colour', () => {
    renderItem(notification());
    expect(screen.getByTestId('notification-unread')).toHaveTextContent('Nowe');
    expect(screen.getByTestId('notification-title')).toHaveClass(
      'font-semibold',
    );
    expect(screen.getByTestId('notification-item')).toHaveAttribute(
      'data-unread',
      'true',
    );
  });

  it('drops the label and the weight once read', () => {
    renderItem(notification({ isRead: true }));
    expect(screen.queryByTestId('notification-unread')).not.toBeInTheDocument();
    expect(screen.getByTestId('notification-title')).toHaveClass('font-normal');
    expect(screen.getByTestId('notification-item')).not.toHaveAttribute(
      'data-unread',
    );
  });

  it('uses no crimson and no green: neither is an unread or read colour', () => {
    renderItem(notification());
    const html = screen.getByTestId('notification-item').outerHTML;
    expect(html).not.toMatch(/crimson|ready|signal|destructive/);
  });
});

describe('NotificationItem — click target', () => {
  it('is one link to the resource and marks an unread row read', async () => {
    const { onRead } = renderItem(notification());
    const row = screen.getByTestId('notification-item');
    expect(row.tagName).toBe('A');
    expect(row).toHaveAttribute('href', '/knowledge/documents-list');
    await userEvent.click(row);
    expect(onRead).toHaveBeenCalledWith('n1');
  });

  it('does not mark an already-read row again', async () => {
    const { onRead } = renderItem(notification({ isRead: true }));
    await userEvent.click(screen.getByTestId('notification-item'));
    expect(onRead).not.toHaveBeenCalled();
  });

  it('renders a button, not a link, when there is nowhere to go', () => {
    renderItem(notification({ resourceUrl: null }));
    expect(screen.getByTestId('notification-item').tagName).toBe('BUTTON');
  });

  it('never links off the site', () => {
    expect(internalHref('/threads/1')).toBe('/threads/1');
    expect(internalHref('https://example.com')).toBeNull();
    expect(internalHref('//example.com/x')).toBeNull();
    expect(internalHref('javascript:alert(1)')).toBeNull();
    expect(internalHref(null)).toBeNull();
  });
});

describe('NotificationItem — time', () => {
  it('reads "just now" under a minute', () => {
    renderItem(notification({ createdAt: new Date('2026-09-24T11:59:30Z') }));
    expect(screen.getByText('przed chwilą')).toBeInTheDocument();
  });

  it('is relative, against the provider clock, under a day', () => {
    renderItem(notification({ createdAt: new Date('2026-09-24T11:55:00Z') }), {
      locale: 'en',
    });
    expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
  });

  it('prints an absolute date in the configured zone, not the browser one', () => {
    const createdAt = new Date('2026-09-20T10:00:00Z');
    renderItem(notification({ createdAt }), { timeZone: 'Europe/Warsaw' });
    // 10:00 UTC is 12:00 in Warsaw (CEST). `toLocaleString` without a
    // `timeZone` printed whatever zone the machine was in, so the server and
    // the browser disagreed and React reported a hydration mismatch.
    const time = document.querySelector('time');
    expect(time).toHaveTextContent('20 wrz, 12:00');
    expect(time).toHaveAttribute('dateTime', createdAt.toISOString());
  });

  it('follows the configured zone when it changes', () => {
    renderItem(notification({ createdAt: new Date('2026-09-20T10:00:00Z') }), {
      timeZone: 'UTC',
    });
    expect(document.querySelector('time')).toHaveTextContent('20 wrz, 10:00');
  });
});

describe('NotificationItem — text rendered in the reader’s locale', () => {
  const title = () => screen.getByTestId('notification-title');
  const body = () => screen.queryByTestId('notification-body');

  it('renders a shared document with the sharer, in Polish', () => {
    renderItem(
      notification({
        title: 'A document was shared with you',
        body: 'Pricing.pdf',
        metadata: {
          resourceName: 'Pricing.pdf',
          resourceKind: 'file',
          sharedByName: 'Anna Nowak',
        },
      }),
      { locale: 'pl' },
    );
    expect(title()).toHaveTextContent('Anna Nowak udostępnia Ci dokument');
    expect(body()).toHaveTextContent('Pricing.pdf');
  });

  it('renders the same row in English for an English reader', () => {
    renderItem(
      notification({
        title: 'Udostępniono Ci dokument',
        metadata: {
          resourceName: 'Pricing.pdf',
          resourceKind: 'file',
          sharedByName: 'Anna Nowak',
        },
      }),
      { locale: 'en' },
    );
    expect(title()).toHaveTextContent('Anna Nowak shared a document with you');
    expect(title()).not.toHaveTextContent('Udostępniono');
  });

  it('says folder for a folder, and drops the name it does not have', () => {
    renderItem(
      notification({
        metadata: { resourceName: 'HR', resourceKind: 'folder' },
      }),
      { locale: 'en' },
    );
    expect(title()).toHaveTextContent('A folder was shared with you');
    expect(body()).toHaveTextContent('HR');
  });

  it('renders a shared assistant', () => {
    renderItem(
      notification({
        type: 'PROJECT_SHARED',
        metadata: { projectName: 'Sales', sharedByName: 'Peter' },
      }),
      { locale: 'pl' },
    );
    expect(title()).toHaveTextContent('Peter udostępnia Ci asystenta');
    expect(body()).toHaveTextContent('Sales');
  });

  it('renders a shared thread with no title as a title alone', () => {
    renderItem(
      notification({
        type: 'THREAD_SHARED_NEW_MESSAGE',
        body: null,
        metadata: {},
      }),
      { locale: 'en' },
    );
    expect(title()).toHaveTextContent('A thread was shared with you');
    expect(body()).not.toBeInTheDocument();
  });

  it.each([
    ['pl', 1, 'Zaimportowano 1 plik z folderu „Specs”'],
    ['pl', 3, 'Zaimportowano 3 pliki z folderu „Specs”'],
    ['pl', 5, 'Zaimportowano 5 plików z folderu „Specs”'],
    ['pl', 22, 'Zaimportowano 22 pliki z folderu „Specs”'],
    ['en', 1, 'Imported 1 file from “Specs”'],
    ['en', 0, 'Imported 0 files from “Specs”'],
    ['en', 7, 'Imported 7 files from “Specs”'],
  ] as const)(
    'pluralises a Drive import (%s, %i files)',
    (locale, importedCount, expected) => {
      renderItem(
        notification({
          type: 'DRIVE_IMPORT_COMPLETED',
          metadata: { folderName: 'Specs', importedCount },
        }),
        { locale },
      );
      expect(body()).toHaveTextContent(expected);
    },
  );

  it.each([
    ['pl', 0, 'Dokument „Umowa” wygasa dziś'],
    ['pl', 2, 'Dokument „Umowa” wygasa za 2 dni'],
    ['en', 1, '“Umowa” expires tomorrow'],
    ['en', 5, '“Umowa” expires in 5 days'],
  ] as const)(
    'pluralises an expiry (%s, %i days)',
    (locale, daysUntilExpiry, expected) => {
      renderItem(
        notification({
          type: 'DOCUMENT_EXPIRING',
          metadata: { documentName: 'Umowa', daysUntilExpiry },
        }),
        { locale },
      );
      expect(title()).toHaveTextContent(expected);
    },
  );

  it('renders a processed document', () => {
    renderItem(
      notification({
        type: 'DOCUMENT_EMBEDDED',
        metadata: { documentName: 'Returns.pdf' },
      }),
      { locale: 'en' },
    );
    expect(title()).toHaveTextContent('“Returns.pdf” is ready to search');
  });
});

describe('NotificationItem — the fallback', () => {
  it('shows an old row, with no details, exactly as stored', () => {
    renderItem(
      notification({
        title: 'Udostępniono Ci dokument',
        body: 'Pricing.pdf',
        metadata: null,
      }),
      { locale: 'en' },
    );
    expect(screen.getByTestId('notification-title')).toHaveTextContent(
      'Udostępniono Ci dokument',
    );
    expect(screen.getByTestId('notification-body')).toHaveTextContent(
      'Pricing.pdf',
    );
  });

  it('shows the stored text when the details do not match the type', () => {
    renderItem(
      notification({
        type: 'DRIVE_IMPORT_COMPLETED',
        title: 'Google Drive import finished',
        body: 'Imported 3 files from "Specs"',
        metadata: { folderName: 'Specs', importedCount: 'three' },
      }),
      { locale: 'pl' },
    );
    expect(screen.getByTestId('notification-title')).toHaveTextContent(
      'Google Drive import finished',
    );
    expect(screen.getByTestId('notification-body')).toHaveTextContent(
      'Imported 3 files from "Specs"',
    );
  });

  it('shows the stored text, with an icon, for a type this build does not know', () => {
    renderItem(
      notification({
        type: 'SOMETHING_NEW' as NotificationDto['type'],
        title: 'Something new happened',
        body: null,
        metadata: { anything: true },
      }),
      { locale: 'en' },
    );
    expect(screen.getByTestId('notification-title')).toHaveTextContent(
      'Something new happened',
    );
    expect(
      screen.getByTestId('notification-item').querySelector('svg'),
    ).not.toBeNull();
  });
});
