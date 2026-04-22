import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { Breadcrumbs } from '../Breadcrumbs';

vi.mock('@/app/actions/folders', () => ({
  getFolderBreadcrumbs: vi.fn(),
}));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { getFolderBreadcrumbs } from '@/app/actions/folders';

const mockGetFolderBreadcrumbs = vi.mocked(getFolderBreadcrumbs);

const messages = {
  folders: {
    'knowledge-base': 'Knowledge Base',
    'more-folders': 'More folders',
    'breadcrumb-nav': 'Folder navigation',
    'all-files': 'All Files',
    'my-files': 'My Files',
    'shared-with-me': 'Shared with me',
  },
};

function mockDesktop() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, // max-width: 768px → false = desktop
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function mockMobile() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true, // max-width: 768px → true = mobile
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderBreadcrumbs(props: {
  folderId: string | null;
  onNavigate?: (id: string | null) => void;
}) {
  const onNavigate = props.onNavigate ?? vi.fn();
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <Breadcrumbs
        folderId={props.folderId}
        viewMode="all"
        onNavigate={onNavigate}
      />
    </NextIntlClientProvider>,
  );
}

describe('Breadcrumbs', () => {
  beforeEach(() => {
    mockDesktop();
    mockGetFolderBreadcrumbs.mockResolvedValue([]);
  });

  it('renders root only when folderId is null', () => {
    renderBreadcrumbs({ folderId: null });
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('renders single segment without overflow', async () => {
    mockGetFolderBreadcrumbs.mockResolvedValue([
      { id: 'f1', name: 'Folder A' },
    ]);
    renderBreadcrumbs({ folderId: 'f1' });
    await waitFor(() =>
      expect(screen.getByText('Folder A')).toBeInTheDocument(),
    );
    expect(screen.queryByText('...')).not.toBeInTheDocument();
  });

  it('renders 4 segments on desktop without overflow', async () => {
    mockGetFolderBreadcrumbs.mockResolvedValue([
      { id: 'f1', name: 'A' },
      { id: 'f2', name: 'B' },
      { id: 'f3', name: 'C' },
      { id: 'f4', name: 'D' },
    ]);
    renderBreadcrumbs({ folderId: 'f4' });
    await waitFor(() => expect(screen.getByText('D')).toBeInTheDocument());
    expect(screen.queryByText('...')).not.toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('truncates on desktop when more than 4 segments', async () => {
    mockGetFolderBreadcrumbs.mockResolvedValue([
      { id: 'f1', name: 'A' },
      { id: 'f2', name: 'B' },
      { id: 'f3', name: 'C' },
      { id: 'f4', name: 'D' },
      { id: 'f5', name: 'E' },
      { id: 'f6', name: 'F' },
    ]);
    renderBreadcrumbs({ folderId: 'f6' });
    await waitFor(() => expect(screen.getByText('...')).toBeInTheDocument());
    expect(screen.queryByText('A')).not.toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
    expect(screen.getByText('F')).toBeInTheDocument();
  });

  it('truncates on mobile when more than 1 visible segment', async () => {
    mockMobile();
    mockGetFolderBreadcrumbs.mockResolvedValue([
      { id: 'f1', name: 'A' },
      { id: 'f2', name: 'B' },
      { id: 'f3', name: 'C' },
    ]);
    renderBreadcrumbs({ folderId: 'f3' });
    await waitFor(() => expect(screen.getByText('...')).toBeInTheDocument());
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('A')).not.toBeInTheDocument();
  });

  it('shows hidden segments in overflow dropdown on click', async () => {
    const user = userEvent.setup();
    mockGetFolderBreadcrumbs.mockResolvedValue([
      { id: 'f1', name: 'A' },
      { id: 'f2', name: 'B' },
      { id: 'f3', name: 'C' },
      { id: 'f4', name: 'D' },
      { id: 'f5', name: 'E' },
    ]);
    renderBreadcrumbs({ folderId: 'f5' });
    await waitFor(() => expect(screen.getByText('...')).toBeInTheDocument());
    await user.click(screen.getByText('...'));
    expect(await screen.findByText('A')).toBeInTheDocument();
  });

  it('calls onNavigate with folder id when clicking a segment', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mockGetFolderBreadcrumbs.mockResolvedValue([
      { id: 'f1', name: 'A' },
      { id: 'f2', name: 'B' },
    ]);
    renderBreadcrumbs({ folderId: 'f2', onNavigate });
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    await user.click(screen.getByText('A'));
    expect(onNavigate).toHaveBeenCalledWith('f1');
  });

  it('last segment is not a button', async () => {
    mockGetFolderBreadcrumbs.mockResolvedValue([
      { id: 'f1', name: 'A' },
      { id: 'f2', name: 'Last' },
    ]);
    renderBreadcrumbs({ folderId: 'f2' });
    await waitFor(() => expect(screen.getByText('Last')).toBeInTheDocument());
    const lastEl = screen.getByText('Last');
    expect(lastEl.tagName).not.toBe('BUTTON');
  });

  it('calls onNavigate with null when clicking home', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mockGetFolderBreadcrumbs.mockResolvedValue([{ id: 'f1', name: 'A' }]);
    renderBreadcrumbs({ folderId: 'f1', onNavigate });
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    await user.click(screen.getByText('Knowledge Base'));
    expect(onNavigate).toHaveBeenCalledWith(null);
  });
});
