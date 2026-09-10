import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

// Polyfill ResizeObserver for cmdk (CommandDialog)
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof window.ResizeObserver;
}

// Mock auth to prevent Stripe initialization
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

// Mock logger
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Mock search context
const mockCloseSearch = vi.fn();
let mockIsSearchOpen = true;

vi.mock('@/app/hooks/useSearchThreadsContext', () => ({
  useSearchThreads: () => ({
    isSearchOpen: mockIsSearchOpen,
    closeSearch: (...args: unknown[]) => mockCloseSearch(...args),
    openSearch: vi.fn(),
    modalRef: { current: null },
  }),
}));

// Mock i18n routing
const mockRouterPush = vi.fn();
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockRouterPush(...args),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: vi.fn(() => '/'),
  Link: ({ children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a {...props}>{children}</a>
  ),
}));

// Mock toast
vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    errorToast: vi.fn(),
    successToast: vi.fn(),
  }),
}));

// Use vi.hoisted for mock functions that need to be referenced in vi.mock factories
const {
  mockGetSidebarThreads,
  mockSearchAll,
  mockGetRecentProjects,
  mockSearchDocuments,
} = vi.hoisted(() => ({
  mockGetSidebarThreads: vi.fn(),
  mockSearchAll: vi.fn(),
  mockSearchDocuments: vi.fn().mockResolvedValue([]),
  mockGetRecentProjects: vi.fn(),
}));

// Mock server actions
vi.mock('@/app/actions', () => ({
  getAllOrgFiles: vi.fn().mockResolvedValue({ files: [] }),
}));

vi.mock(
  '@/features/threads/services/queries/get-sidebar-threads-query',
  () => ({
    getSidebarThreadsQuery: (...args: unknown[]) =>
      mockGetSidebarThreads(...args),
  }),
);

vi.mock('../search-actions', () => ({
  searchAll: (...args: unknown[]) => mockSearchAll(...args),
  getRecentProjects: (...args: unknown[]) => mockGetRecentProjects(...args),
  searchDocuments: (...args: unknown[]) => mockSearchDocuments(...args),
}));

// Lazy import to ensure mocks are in place
const { SearchThreads } = await import('../SearchThreads');

const messages = {
  'search-threads': {
    title: 'Search documents, chats and assistants',
    'error-suggestions': 'Error fetching suggestions',
    'error-threads': 'Error fetching threads',
    'threads-not-found': 'Thread not found',
    'no-results': 'No results found.',
    'no-results-description': 'Try different keywords or check your spelling',
    placeholder: 'Search documents, chats and assistants...',
    recent: 'Recent',
    threads: 'Chats',
    projects: 'Assistants',
    documents: 'Documents',
    untitled: 'Untitled',
    loading: 'Loading...',
    'date-today': 'Today',
    'date-yesterday': 'Yesterday',
    'date-days-ago': '{count} days ago',
    'date-past-week': 'Past week',
    'date-past-month': 'Past month',
  },
};

const renderSearchThreads = () => {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <SearchThreads visitorId="user-1" />
    </NextIntlClientProvider>,
  );
};

describe('SearchThreads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSearchOpen = true;

    mockGetSidebarThreads.mockResolvedValue({
      starred: [],
      recent: [
        {
          id: 'thread-1',
          title: 'How to use AI',
          createdAt: new Date().toISOString(),
          messages: [{ content: 'First message' }],
        },
        {
          id: 'thread-2',
          title: null,
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          messages: [{ content: 'Another question about API integration' }],
        },
      ],
    });

    mockGetRecentProjects.mockResolvedValue([
      {
        id: 'proj-1',
        title: 'My Project',
        createdAt: new Date().toISOString(),
      },
    ]);

    mockSearchAll.mockResolvedValue([
      {
        id: 'proj-search-1',
        title: 'Marketing Project',
        type: 'project',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'thread-search-1',
        title: 'Chat about marketing',
        type: 'thread',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ]);
  });

  describe('rendering', () => {
    it('renders search input when open', async () => {
      renderSearchThreads();
      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(
            'Search documents, chats and assistants...',
          ),
        ).toBeInTheDocument();
      });
    });
  });

  describe('recent data loading', () => {
    it('loads recent threads and projects when dialog opens', async () => {
      renderSearchThreads();

      await waitFor(() => {
        expect(mockGetSidebarThreads).toHaveBeenCalledWith('user-1', 10, 0);
        expect(mockGetRecentProjects).toHaveBeenCalled();
      });
    });

    it('displays recent threads', async () => {
      renderSearchThreads();

      await waitFor(() => {
        expect(screen.getByText('How to use AI')).toBeInTheDocument();
      });
    });

    it('shows fallback text for untitled threads', async () => {
      renderSearchThreads();

      await waitFor(() => {
        expect(screen.getByText('Untitled')).toBeInTheDocument();
      });
    });

    it('displays recent projects', async () => {
      renderSearchThreads();

      await waitFor(() => {
        expect(screen.getByText('My Project')).toBeInTheDocument();
      });
    });

    it('shows relative date labels', async () => {
      renderSearchThreads();

      await waitFor(() => {
        expect(screen.getByText('Today')).toBeInTheDocument();
        expect(screen.getByText('Yesterday')).toBeInTheDocument();
      });
    });
  });

  describe('search functionality', () => {
    it('triggers search after typing 2+ characters', async () => {
      const user = userEvent.setup();
      renderSearchThreads();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(
            'Search documents, chats and assistants...',
          ),
        ).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(
        'Search documents, chats and assistants...',
      );
      await user.type(input, 'ma');

      await waitFor(
        () => {
          expect(mockSearchAll).toHaveBeenCalledWith('user-1', 'ma');
        },
        { timeout: 2000 },
      );
    });

    it('does not search with less than 2 characters', async () => {
      const user = userEvent.setup();
      renderSearchThreads();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(
            'Search documents, chats and assistants...',
          ),
        ).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(
        'Search documents, chats and assistants...',
      );
      await user.type(input, 'a');

      // Wait a bit and verify search was NOT called
      await new Promise((r) => setTimeout(r, 500));
      expect(mockSearchAll).not.toHaveBeenCalled();
    });

    it('shows the fast search without waiting for the slow one', async () => {
      // Documents are a local query; threads go through apps/api. Waiting for
      // the pair means the fast half always waits for the slow one.
      mockSearchDocuments.mockResolvedValue([
        { id: 'f1', fileName: 'umowa-najmu.pdf' },
      ]);
      let releaseThreads: (value: unknown[]) => void = () => {};
      mockSearchAll.mockReturnValue(
        new Promise((resolve) => {
          releaseThreads = resolve as (value: unknown[]) => void;
        }),
      );

      const user = userEvent.setup();
      renderSearchThreads();
      const input = await screen.findByPlaceholderText(
        'Search documents, chats and assistants...',
      );
      await user.type(input, 'umowa');

      // Rendered while the thread search is still pending.
      expect(await screen.findByText('umowa-najmu.pdf')).toBeInTheDocument();

      releaseThreads([]);
    });

    it('shows matching documents in their own group', async () => {
      mockSearchAll.mockResolvedValue([]);
      mockSearchDocuments.mockResolvedValue([
        { id: 'f1', fileName: 'umowa-najmu.pdf' },
      ]);

      const user = userEvent.setup();
      renderSearchThreads();
      const input = await screen.findByPlaceholderText(
        'Search documents, chats and assistants...',
      );
      await user.type(input, 'umowa');

      expect(await screen.findByText('umowa-najmu.pdf')).toBeInTheDocument();
      expect(screen.getByText('Documents')).toBeInTheDocument();
    });

    it('still shows documents when the thread search fails', async () => {
      // The two searches hit different backends — threads go through
      // apps/api, documents are a local query. Half the answers beats none.
      mockSearchAll.mockRejectedValue(new Error('apps/api is down'));
      mockSearchDocuments.mockResolvedValue([
        { id: 'f1', fileName: 'umowa-najmu.pdf' },
      ]);

      const user = userEvent.setup();
      renderSearchThreads();
      const input = await screen.findByPlaceholderText(
        'Search documents, chats and assistants...',
      );
      await user.type(input, 'umowa');

      expect(await screen.findByText('umowa-najmu.pdf')).toBeInTheDocument();
    });

    it('displays search results grouped by type', async () => {
      const user = userEvent.setup();
      renderSearchThreads();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(
            'Search documents, chats and assistants...',
          ),
        ).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(
        'Search documents, chats and assistants...',
      );
      await user.type(input, 'marketing');

      await waitFor(
        () => {
          expect(screen.getByText('Marketing Project')).toBeInTheDocument();
          expect(screen.getByText('Chat about marketing')).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      expect(screen.getByText('Assistants')).toBeInTheDocument();
      expect(screen.getByText('Chats')).toBeInTheDocument();
    });

    it('shows no results message when search returns empty', async () => {
      mockSearchAll.mockResolvedValue([]);
      const user = userEvent.setup();
      renderSearchThreads();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(
            'Search documents, chats and assistants...',
          ),
        ).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(
        'Search documents, chats and assistants...',
      );
      await user.type(input, 'nonexistent');

      await waitFor(
        () => {
          expect(screen.getByText('No results found.')).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });
  });

  describe('navigation', () => {
    it('navigates to thread on selection', async () => {
      const user = userEvent.setup();
      renderSearchThreads();

      await waitFor(() => {
        expect(screen.getByText('How to use AI')).toBeInTheDocument();
      });

      await user.click(screen.getByText('How to use AI'));

      expect(mockCloseSearch).toHaveBeenCalled();
      expect(mockRouterPush).toHaveBeenCalledWith('/chats/thread-1');
    });

    it('navigates to project on selection', async () => {
      const user = userEvent.setup();
      renderSearchThreads();

      await waitFor(() => {
        expect(screen.getByText('My Project')).toBeInTheDocument();
      });

      await user.click(screen.getByText('My Project'));

      expect(mockCloseSearch).toHaveBeenCalled();
      expect(mockRouterPush).toHaveBeenCalledWith('/projects/proj-1');
    });
  });

  describe('state management', () => {
    it('does not load data when dialog is closed', () => {
      mockIsSearchOpen = false;
      renderSearchThreads();

      expect(mockGetSidebarThreads).not.toHaveBeenCalled();
      expect(mockGetRecentProjects).not.toHaveBeenCalled();
    });
  });
});
