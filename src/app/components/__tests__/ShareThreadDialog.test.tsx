import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { ShareThreadDialog } from '../ShareThreadDialog';

const mockGetThreadShares = vi.fn();
const mockShareThread = vi.fn();

vi.mock('@/features/threads/services/actions/thread-share-actions', () => ({
  getThreadSharesAction: (...args: unknown[]) => mockGetThreadShares(...args),
  shareThreadAction: (...args: unknown[]) => mockShareThread(...args),
}));

vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    successToast: vi.fn(),
    errorToast: vi.fn(),
  }),
}));

const messages = {
  'thread-actions': {
    'share-title': 'Share thread',
    'share-description': 'Share this thread with organization members',
    'share-save': 'Save',
    'share-success': 'Thread sharing updated',
    'share-error': 'Failed to update sharing',
    'share-load-error': 'Failed to load sharing info',
    'share-retry': 'Retry',
    'share-no-members': 'No other members in this organization',
    cancel: 'Cancel',
  },
};

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  threadPublicId: 'thread-123',
};

const renderDialog = (props = {}) =>
  render(
    <NextIntlClientProvider messages={messages} locale="en">
      <ShareThreadDialog {...defaultProps} {...props} />
    </NextIntlClientProvider>,
  );

describe('ShareThreadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while fetching shares', () => {
    mockGetThreadShares.mockReturnValue(new Promise(() => {})); // Never resolves
    renderDialog();

    expect(screen.getByText('Share thread')).toBeInTheDocument();
    // Verify the spinner is displayed
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('shows error state with retry button on fetch failure', async () => {
    const user = userEvent.setup();
    mockGetThreadShares.mockRejectedValueOnce(new Error('Network error'));
    mockGetThreadShares.mockResolvedValueOnce({
      threadPublicId: 'thread-123',
      sharedWith: [],
    });

    renderDialog();

    expect(
      await screen.findByText('Failed to load sharing info'),
    ).toBeInTheDocument();

    // Retry
    await user.click(screen.getByText('Retry'));

    expect(
      await screen.findByText('No other members in this organization'),
    ).toBeInTheDocument();
  });

  it('shows no members message when org has no other members', async () => {
    mockGetThreadShares.mockResolvedValue({
      threadPublicId: 'thread-123',
      sharedWith: [],
    });

    renderDialog();

    // Wait for loading to finish and empty state to show
    expect(
      await screen.findByText('No other members in this organization'),
    ).toBeInTheDocument();
  });

  it('renders member list with toggle switches', async () => {
    mockGetThreadShares.mockResolvedValue({
      threadPublicId: 'thread-123',
      sharedWith: [
        {
          userId: 'user-2',
          name: 'Alice',
          email: 'alice@example.com',
          image: null,
          isShared: true,
        },
        {
          userId: 'user-3',
          name: 'Bob',
          email: 'bob@example.com',
          image: null,
          isShared: false,
        },
      ],
    });

    renderDialog();

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(2);
    expect(switches[0]).toHaveAttribute('data-state', 'checked'); // Alice is shared
    expect(switches[1]).toHaveAttribute('data-state', 'unchecked'); // Bob is not shared
  });

  it('calls shareThread with selected user IDs on save', async () => {
    const user = userEvent.setup();
    mockGetThreadShares.mockResolvedValue({
      threadPublicId: 'thread-123',
      sharedWith: [
        {
          userId: 'user-2',
          name: 'Alice',
          email: 'alice@example.com',
          image: null,
          isShared: false,
        },
      ],
    });
    mockShareThread.mockResolvedValue({ success: true });

    renderDialog();

    expect(await screen.findByText('Alice')).toBeInTheDocument();

    // Toggle Alice on
    const switchEl = screen.getByRole('switch');
    await user.click(switchEl);

    // Save
    const saveButton = screen.getByText('Save');
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockShareThread).toHaveBeenCalledWith('thread-123', ['user-2']);
    });
  });

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockGetThreadShares.mockResolvedValue({
      threadPublicId: 'thread-123',
      sharedWith: [],
    });

    renderDialog({ onClose });

    expect(
      await screen.findByText('No other members in this organization'),
    ).toBeInTheDocument();

    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
