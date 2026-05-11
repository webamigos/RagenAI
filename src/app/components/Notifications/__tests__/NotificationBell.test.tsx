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

global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

const mockEventSource = {
  addEventListener: vi.fn(),
  close: vi.fn(),
};
vi.stubGlobal(
  'EventSource',
  vi.fn(() => mockEventSource),
);

const messages = {
  notifications: {
    title: 'Powiadomienia',
    'mark-all-read': 'Oznacz wszystkie jako przeczytane',
    loading: 'Ładowanie...',
    empty: 'Nie masz żadnych powiadomień',
    'show-all': 'Pokaż wszystkie',
    label: 'Powiadomienia',
    'unread-aria': 'nieprzeczytane',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetNotificationsAction.mockResolvedValue({ items: [], nextCursor: null });
});

function renderBell() {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <NotificationBell />
    </NextIntlClientProvider>,
  );
}

describe('NotificationBell', () => {
  it('renders bell icon', () => {
    renderBell();
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
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

  it('shows 99+ when unread count exceeds 99', async () => {
    mockGetNotificationsAction.mockResolvedValue({
      items: Array.from({ length: 100 }, (_, i) => ({
        publicId: `p${i}`,
        type: 'DOCUMENT_SHARED',
        isRead: false,
        title: 'Test',
        body: null,
        resourceUrl: null,
        createdAt: new Date().toISOString(),
      })),
      nextCursor: null,
    });
    renderBell();
    await waitFor(() => {
      expect(screen.getByTestId('unread-badge')).toHaveTextContent('99+');
    });
  });
});
