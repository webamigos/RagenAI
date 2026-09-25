import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import pl from '@/app/messages/pl.json';
import { NOTIFICATIONS_READ_EVENT } from '@/app/lib/services/notifications/types';

const actions = vi.hoisted(() => ({
  getNotificationsAction: vi.fn(),
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));
vi.mock('@/app/actions', () => actions);

const errorToast = vi.hoisted(() => vi.fn());
vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({ errorToast }),
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
}));

import NotificationsPage from '../page';

type Params = { isRead?: boolean; type?: string; cursor?: string };

function item(id: string, isRead: boolean) {
  return {
    publicId: id,
    type: 'DOCUMENT_SHARED' as const,
    isRead,
    title: `Notification ${id}`,
    body: null,
    resourceUrl: null,
    createdAt: new Date('2026-09-23T10:00:00Z'),
  };
}

/** Answers the list and the unread-count reads separately, as apps/api does. */
function serve(
  list: ReturnType<typeof item>[],
  { failed = false, nextCursor = null as string | null } = {},
) {
  actions.getNotificationsAction.mockImplementation(async (p: Params) => {
    if (failed) {
      return { items: [], nextCursor: null, failed: true };
    }
    if (p.isRead === false) {
      return {
        items: list.filter((n) => !n.isRead),
        nextCursor: null,
        failed: false,
      };
    }
    return { items: list, nextCursor, failed: false };
  });
}

function renderPage() {
  return render(
    <NextIntlClientProvider
      locale="pl"
      messages={pl}
      timeZone="Europe/Warsaw"
      now={new Date('2026-09-24T12:00:00Z')}
    >
      <NotificationsPage />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.markNotificationReadAction.mockResolvedValue(undefined);
  actions.markAllNotificationsReadAction.mockResolvedValue(undefined);
});

describe('NotificationsPage — layout', () => {
  it('fills the whole panel, like the other list screens, instead of a centred column', async () => {
    serve([]);
    renderPage();
    const page = screen.getByTestId('notifications-page');
    expect(page).toHaveClass('w-full', 'min-w-0');
    expect(page).not.toHaveClass('max-w-[1120px]');
    expect(page).toHaveAttribute('data-panel-fullwidth');
    expect(page).not.toHaveClass('mx-auto');
    expect(page).not.toHaveClass('max-w-2xl');
    await screen.findByText(pl.notifications.empty);
  });

  it('wraps the filter chips rather than scrolling them out of view', async () => {
    serve([]);
    renderPage();
    const group = screen.getByRole('group', {
      name: pl.notifications.filters.label,
    });
    expect(group).toHaveClass('flex-wrap');
    expect(group).not.toHaveClass('overflow-x-auto');
    await screen.findByText(pl.notifications.empty);
  });

  it('offers a chip for every notification type, shared assistants included', async () => {
    serve([]);
    renderPage();
    const group = screen.getByRole('group', {
      name: pl.notifications.filters.label,
    });
    const labels = within(group)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(labels).toEqual([
      pl.notifications.filters.all,
      pl.notifications.filters['document-shared'],
      pl.notifications.filters['project-shared'],
      pl.notifications.filters['thread-shared'],
      pl.notifications.filters['drive-import'],
      pl.notifications.filters['document-embedded'],
      pl.notifications.filters['document-expiring'],
    ]);
    await screen.findByText(pl.notifications.empty);
  });
});

describe('NotificationsPage — filters', () => {
  it('marks the active chip with aria-pressed and asks for that type', async () => {
    serve([]);
    renderPage();
    await screen.findByText(pl.notifications.empty);
    const chip = screen.getByRole('button', {
      name: pl.notifications.filters['thread-shared'],
    });
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: pl.notifications.filters.all }),
    ).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() =>
      expect(actions.getNotificationsAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'THREAD_SHARED_NEW_MESSAGE' }),
      ),
    );
  });

  it('says a filter is empty, and offers the way back to all', async () => {
    serve([]);
    renderPage();
    await screen.findByText(pl.notifications.empty);
    await userEvent.click(
      screen.getByRole('button', {
        name: pl.notifications.filters['drive-import'],
      }),
    );
    expect(
      await screen.findByText(pl.notifications['empty-filtered']),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: pl.notifications['show-all'] }),
    );
    expect(
      screen.getByRole('button', { name: pl.notifications.filters.all }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores a response for a filter the user has already left', async () => {
    let resolveSlow: (v: unknown) => void = () => {};
    actions.getNotificationsAction.mockImplementation(async (p: Params) => {
      if (p.isRead === false) {
        return { items: [], nextCursor: null, failed: false };
      }
      if (p.type === 'DOCUMENT_SHARED') {
        return new Promise((r) => {
          resolveSlow = r;
        });
      }
      return { items: [item('fresh', true)], nextCursor: null, failed: false };
    });
    renderPage();
    await screen.findByText('Notification fresh');
    await userEvent.click(
      screen.getByRole('button', {
        name: pl.notifications.filters['document-shared'],
      }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: pl.notifications.filters.all }),
    );
    await screen.findByText('Notification fresh');
    resolveSlow({
      items: [item('stale', true)],
      nextCursor: null,
      failed: false,
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Notification stale')).not.toBeInTheDocument();
  });
});

describe('NotificationsPage — empty and error states', () => {
  it('is two lines, not a lone grey sentence', async () => {
    serve([]);
    renderPage();
    expect(await screen.findByText(pl.notifications.empty)).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-description')).toHaveTextContent(
      pl.notifications['empty-description'],
    );
    expect(
      screen.queryByTestId('notifications-mark-all-read'),
    ).not.toBeInTheDocument();
  });

  it('says the list failed to load instead of claiming there is nothing', async () => {
    serve([], { failed: true });
    renderPage();
    expect(
      await screen.findByText(pl.notifications['load-error']),
    ).toBeInTheDocument();
    expect(screen.queryByText(pl.notifications.empty)).not.toBeInTheDocument();
    serve([item('a', true)]);
    await userEvent.click(
      screen.getByRole('button', { name: pl.notifications.retry }),
    );
    expect(await screen.findByText('Notification a')).toBeInTheDocument();
  });

  it('offers "load more" only when there is a next page', async () => {
    serve([item('a', true)], { nextCursor: 'a' });
    renderPage();
    expect(
      await screen.findByRole('button', {
        name: pl.notifications['load-more'],
      }),
    ).toBeInTheDocument();
  });
});

describe('NotificationsPage — mark all as read', () => {
  it('shows the unread count and a real button only while something is unread', async () => {
    serve([item('a', false), item('b', true)]);
    renderPage();
    expect(
      await screen.findByTestId('notifications-unread-count'),
    ).toHaveTextContent('Nieprzeczytane: 1');
    expect(screen.getByTestId('notifications-mark-all-read').tagName).toBe(
      'BUTTON',
    );
  });

  it('marks everything read and tells the sidebar bell to re-read', async () => {
    serve([item('a', false)]);
    const listener = vi.fn();
    window.addEventListener(NOTIFICATIONS_READ_EVENT, listener);
    renderPage();
    await userEvent.click(
      await screen.findByTestId('notifications-mark-all-read'),
    );
    expect(actions.markAllNotificationsReadAction).toHaveBeenCalled();
    await waitFor(() => expect(listener).toHaveBeenCalled());
    expect(screen.queryByTestId('notification-unread')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('notifications-mark-all-read'),
    ).not.toBeInTheDocument();
    window.removeEventListener(NOTIFICATIONS_READ_EVENT, listener);
  });

  it('puts the rows back and says so when marking fails', async () => {
    serve([item('a', false)]);
    actions.markAllNotificationsReadAction.mockRejectedValue(new Error('down'));
    renderPage();
    await userEvent.click(
      await screen.findByTestId('notifications-mark-all-read'),
    );
    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith({
        message: pl.notifications['mark-read-error'],
      }),
    );
    expect(screen.getByTestId('notification-unread')).toBeInTheDocument();
  });
});
