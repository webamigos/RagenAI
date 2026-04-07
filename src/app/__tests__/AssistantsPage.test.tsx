import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { AssistantsPage } from '../[locale]/(panel)/assistants/AssistantsPage';

// Mock auth hooks
const mockOrganization = { id: 'org-1', name: 'Test Org' };
const mockUser = { id: 'user-1', name: 'Test User', role: 'user' };

vi.mock('@/app/hooks/use-auth', () => ({
  useOrganization: () => ({ organization: mockOrganization }),
  useUser: () => ({ user: mockUser }),
}));

// Mock i18n routing
vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  usePathname: vi.fn(() => '/en/assistants'),
  redirect: vi.fn(),
}));

// Mock getProjects action
vi.mock('@/app/components/Sidebar/Projects/actions', () => ({
  getProjects: vi.fn().mockResolvedValue({
    projects: [
      {
        id: 'proj-1',
        title: 'Marketing Bot',
        createdAt: new Date(),
        threads: [{ id: 't-1' }, { id: 't-2' }],
      },
      {
        id: 'proj-2',
        title: 'Sales Assistant',
        createdAt: new Date(),
        threads: [{ id: 't-3' }],
      },
      {
        id: 'default-proj',
        title: 'Default',
        createdAt: new Date(),
        threads: [],
      },
    ],
  }),
}));

// Mock CreateProject component
vi.mock('@/app/components/Sidebar/Projects/components/CreateProject', () => ({
  CreateProject: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="create-project-modal">
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null,
}));

// Mock logger
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Mock format-relative-time
vi.mock('@/app/lib/utils/format-relative-time', () => ({
  formatRelativeTime: () => '2 hours ago',
}));

const messages = {
  'assistants-page': {
    title: 'Assistants',
    'search-placeholder': 'Search assistants...',
    create: 'New assistant',
    'no-assistants': 'No assistants yet',
    'no-assistants-description': 'Create your first assistant to get started',
    'thread-count': '{count} threads',
    updated: 'Updated {time}',
  },
};

// Create a minimal Redux store
const createTestStore = (defaultProjectId = 'default-proj') =>
  configureStore({
    reducer: {
      threads: () => ({ defaultProjectId }),
    },
  });

const renderAssistantsPage = (store = createTestStore()) => {
  return render(
    <Provider store={store}>
      <NextIntlClientProvider messages={messages} locale="en">
        <AssistantsPage />
      </NextIntlClientProvider>
    </Provider>,
  );
};

describe('AssistantsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the page title', async () => {
      renderAssistantsPage();
      expect(screen.getByText('Assistants')).toBeInTheDocument();
    });

    it('renders the create button', () => {
      renderAssistantsPage();
      expect(screen.getByText('New assistant')).toBeInTheDocument();
    });

    it('renders the search input', () => {
      renderAssistantsPage();
      expect(
        screen.getByPlaceholderText('Search assistants...'),
      ).toBeInTheDocument();
    });
  });

  describe('project listing', () => {
    it('displays projects after loading', async () => {
      renderAssistantsPage();
      await waitFor(() => {
        expect(screen.getByText('Marketing Bot')).toBeInTheDocument();
        expect(screen.getByText('Sales Assistant')).toBeInTheDocument();
      });
    });

    it('excludes default project from the list', async () => {
      renderAssistantsPage();
      await waitFor(() => {
        expect(screen.getByText('Marketing Bot')).toBeInTheDocument();
      });
      expect(screen.queryByText('Default')).not.toBeInTheDocument();
    });

    it('shows thread count for each project', async () => {
      renderAssistantsPage();
      await waitFor(() => {
        expect(screen.getByText('2 threads')).toBeInTheDocument();
        // Note: i18n message uses simple '{count} threads' without ICU pluralization
        expect(screen.getByText('1 threads')).toBeInTheDocument();
      });
    });

    it('shows relative time for each project', async () => {
      renderAssistantsPage();
      await waitFor(() => {
        const timeElements = screen.getAllByText(/Updated 2 hours ago/);
        expect(timeElements.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders project links to /assistants/{id}', async () => {
      renderAssistantsPage();
      await waitFor(() => {
        expect(screen.getByText('Marketing Bot')).toBeInTheDocument();
      });

      const link = screen.getByText('Marketing Bot').closest('a');
      expect(link).toHaveAttribute('href', '/assistants/proj-1');
    });
  });

  describe('search filtering', () => {
    it('filters projects by search query', async () => {
      const user = userEvent.setup();
      renderAssistantsPage();

      await waitFor(() => {
        expect(screen.getByText('Marketing Bot')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search assistants...');
      await user.type(searchInput, 'Marketing');

      expect(screen.getByText('Marketing Bot')).toBeInTheDocument();
      expect(screen.queryByText('Sales Assistant')).not.toBeInTheDocument();
    });

    it('search is case-insensitive', async () => {
      const user = userEvent.setup();
      renderAssistantsPage();

      await waitFor(() => {
        expect(screen.getByText('Marketing Bot')).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText('Search assistants...'),
        'sales',
      );

      expect(screen.getByText('Sales Assistant')).toBeInTheDocument();
      expect(screen.queryByText('Marketing Bot')).not.toBeInTheDocument();
    });

    it('shows empty state when no projects match search', async () => {
      const user = userEvent.setup();
      renderAssistantsPage();

      await waitFor(() => {
        expect(screen.getByText('Marketing Bot')).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText('Search assistants...'),
        'nonexistent',
      );

      expect(screen.getByText('No assistants yet')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no projects exist', async () => {
      const { getProjects } =
        await import('@/app/components/Sidebar/Projects/actions');
      vi.mocked(getProjects).mockResolvedValueOnce({
        projects: [],
        status: 200 as any,
      });

      renderAssistantsPage();

      await waitFor(() => {
        expect(screen.getByText('No assistants yet')).toBeInTheDocument();
        expect(
          screen.getByText('Create your first assistant to get started'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('create project modal', () => {
    it('opens create modal when button is clicked', async () => {
      const user = userEvent.setup();
      renderAssistantsPage();

      await user.click(screen.getByText('New assistant'));

      expect(screen.getByTestId('create-project-modal')).toBeInTheDocument();
    });

    it('closes create modal', async () => {
      const user = userEvent.setup();
      renderAssistantsPage();

      await user.click(screen.getByText('New assistant'));
      expect(screen.getByTestId('create-project-modal')).toBeInTheDocument();

      await user.click(screen.getByText('Close Modal'));
      expect(
        screen.queryByTestId('create-project-modal'),
      ).not.toBeInTheDocument();
    });
  });
});
