import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

const mockGetNotificationsAction = vi.hoisted(() => vi.fn());

vi.mock('@/app/actions', () => ({
  getNotificationsAction: mockGetNotificationsAction,
}));

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
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

import { NotificationBell } from '../NotificationBell';
import { NOTIFICATIONS_READ_EVENT } from '@/app/lib/services/notifications/types';

global.ResizeObserver = vi.fn(function () {
  return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
}) as unknown as typeof ResizeObserver;

const mockEventSource = {
  addEventListener: vi.fn(),
  close: vi.fn(),
};
vi.stubGlobal(
  'EventSource',
  vi.fn(function () {
    return mockEventSource;
  }),
);

const messages = {
  notifications: {
    title: 'Powiadomienia',
    'mark-all-read': 'Oznacz wszystkie jako przeczytane',
    loading: 'Ładowanie...',
    empty: 'Nie masz żadnych powiadomień',
    'show-all': 'Pokaż wszystkie',
    label: 'Powiadomienia',
    'label-with-unread': 'Powiadomienia, nieprzeczytane: {count}',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetNotificationsAction.mockResolvedValue({ items: [], nextCursor: null });
});

function renderBell(variant: 'navbar' | 'sidebar' = 'sidebar') {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NotificationBell variant={variant} />
    </NextIntlClientProvider>,
  );
}

describe('NotificationBell', () => {
  it('renders bell icon', () => {
    renderBell();
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
  });

  it('shows the text label in sidebar variant, matching its sibling sidebar items', () => {
    renderBell('sidebar');
    // Two matches expected: the visible label and the item's aria-label.
    expect(screen.getAllByText('Powiadomienia').length).toBeGreaterThan(0);
  });

  it('does not render a text label in navbar variant (icon-only, compact top bar)', () => {
    renderBell('navbar');
    expect(screen.queryByText('Powiadomienia')).not.toBeInTheDocument();
  });

  it('does not show badge when 0 unread', async () => {
    renderBell();
    await waitFor(() => {
      expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
    });
  });

  it('shows badge with count when unread > 0', async () => {
    mockGetNotificationsAction.mockResolvedValue({
      items: [
        {
          publicId: 'p1',
          type: 'DOCUMENT_SHARED',
          isRead: false,
          title: 'Test',
          body: null,
          resourceUrl: null,
          createdAt: new Date().toISOString(),
        },
      ],
      nextCursor: null,
    });
    renderBell();
    await waitFor(() => {
      expect(screen.getByTestId('unread-badge')).toHaveTextContent('1');
    });
  });

  it('shows "50+" when there are more unread than one page holds', async () => {
    // The bell reads one page of 50. It used to say "99+" past 99, a number
    // it could never reach, and a flat "50" when there were hundreds.
    mockGetNotificationsAction.mockResolvedValue({
      items: Array.from({ length: 50 }, (_, i) => unreadItem(`p${i}`)),
      nextCursor: 'p49',
    });
    renderBell();
    await waitFor(() => {
      expect(screen.getByTestId('unread-badge')).toHaveTextContent('50+');
    });
  });

  it('puts the count in the link name, where a screen reader hears it', async () => {
    mockGetNotificationsAction.mockResolvedValue({
      items: [unreadItem('p1'), unreadItem('p2')],
      nextCursor: null,
    });
    renderBell();
    await waitFor(() => {
      expect(screen.getByTestId('notification-bell')).toHaveAttribute(
        'aria-label',
        'Powiadomienia, nieprzeczytane: 2',
      );
    });
    expect(screen.getByTestId('unread-badge')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('paints the badge navy, not crimson', async () => {
    mockGetNotificationsAction.mockResolvedValue({
      items: [unreadItem('p1')],
      nextCursor: null,
    });
    renderBell();
    const badge = await screen.findByTestId('unread-badge');
    expect(badge).toHaveClass('bg-primary');
    expect(badge.className).not.toMatch(/crimson/);
  });

  it('re-reads the count when the notifications page marks rows read', async () => {
    mockGetNotificationsAction.mockResolvedValue({
      items: [unreadItem('p1')],
      nextCursor: null,
    });
    renderBell();
    await screen.findByTestId('unread-badge');
    mockGetNotificationsAction.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
    await waitFor(() => {
      expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
    });
  });

  it('keeps the last count when a re-read fails, rather than showing 0', async () => {
    mockGetNotificationsAction.mockResolvedValue({
      items: [unreadItem('p1')],
      nextCursor: null,
    });
    renderBell();
    await screen.findByTestId('unread-badge');
    mockGetNotificationsAction.mockResolvedValue({
      items: [],
      nextCursor: null,
      failed: true,
    });
    window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
    await waitFor(() =>
      expect(mockGetNotificationsAction).toHaveBeenCalledTimes(2),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId('unread-badge')).toHaveTextContent('1');
  });
});

function unreadItem(publicId: string) {
  return {
    publicId,
    type: 'DOCUMENT_SHARED',
    isRead: false,
    title: 'Test',
    body: null,
    resourceUrl: null,
    createdAt: new Date().toISOString(),
  };
}
