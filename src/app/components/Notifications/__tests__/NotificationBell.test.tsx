import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
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
}));

const messages = {
  notifications: {
    title: 'Powiadomienia',
    'mark-all-read': 'Oznacz wszystkie jako przeczytane',
    loading: 'Ładowanie...',
    empty: 'Nie masz żadnych powiadomień',
    'show-all': 'Pokaż wszystkie',
  },
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ items: [] }),
  });
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
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
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
      }),
    });
    renderBell();
    await waitFor(() => {
      expect(screen.getByTestId('unread-badge')).toHaveTextContent('1');
    });
  });

  it('shows 99+ when unread count exceeds 99', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: Array.from({ length: 100 }, (_, i) => ({
          publicId: `p${i}`,
          type: 'DOCUMENT_SHARED',
          isRead: false,
          title: 'Test',
          body: null,
          resourceUrl: null,
          createdAt: new Date().toISOString(),
        })),
      }),
    });
    renderBell();
    await waitFor(() => {
      expect(screen.getByTestId('unread-badge')).toHaveTextContent('99+');
    });
  });
});
