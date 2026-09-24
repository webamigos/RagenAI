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
