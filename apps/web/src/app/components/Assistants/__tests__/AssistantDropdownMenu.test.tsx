import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { AssistantDropdownMenu } from '../AssistantDropdownMenu';

const mockStar = vi.fn();
const mockRename = vi.fn();
const mockArchive = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/app/components/Sidebar/Projects/actions', () => ({
  starProjectAction: (...args: unknown[]) => mockStar(...args),
  renameProjectAction: (...args: unknown[]) => mockRename(...args),
  archiveProjectAction: (...args: unknown[]) => mockArchive(...args),
  deleteProjectAction: (...args: unknown[]) => mockDelete(...args),
}));

vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    successToast: vi.fn(),
    errorToast: vi.fn(),
  }),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const messages = {
  'assistant-actions': {
    menu: 'Open assistant menu',
    star: 'Star',
    unstar: 'Unstar',
    'edit-details': 'Edit details',
    archive: 'Archive',
    unarchive: 'Unarchive',
    delete: 'Delete',
    'rename-title': 'Rename assistant',
    'delete-title': 'Delete assistant?',
    'delete-confirm': '"{name}" and all its chats will be deleted.',
    cancel: 'Cancel',
    save: 'Save',
    'error-generic': 'Something went wrong.',
  },
};

const renderMenu = (overrides = {}) => {
  const props = {
    assistant: {
      id: 'proj-1',
      title: 'My Assistant',
      isStarred: false,
      isArchived: false,
    },
    onStarred: vi.fn(),
    onRenamed: vi.fn(),
    onArchived: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  };
  render(
    <NextIntlClientProvider messages={messages} locale="en">
      <AssistantDropdownMenu {...props} />
    </NextIntlClientProvider>,
  );
  return props;
};

describe('AssistantDropdownMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStar.mockResolvedValue({ success: true });
    mockRename.mockResolvedValue({ success: true });
    mockArchive.mockResolvedValue({ success: true });
    mockDelete.mockResolvedValue({ success: true });
  });

  it('toggles star and calls onStarred optimistically', async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByTestId('assistant-menu-trigger'));
    await user.click(await screen.findByText('Star'));

    expect(props.onStarred).toHaveBeenCalledWith('proj-1', true);
    await waitFor(() => expect(mockStar).toHaveBeenCalledWith('proj-1', true));
  });

  it('rolls back star on failure', async () => {
    mockStar.mockResolvedValueOnce({ success: false });
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByTestId('assistant-menu-trigger'));
    await user.click(await screen.findByText('Star'));

    await waitFor(() => {
      expect(props.onStarred).toHaveBeenNthCalledWith(1, 'proj-1', true);
      expect(props.onStarred).toHaveBeenNthCalledWith(2, 'proj-1', false);
    });
  });

  it('opens rename dialog and submits', async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByTestId('assistant-menu-trigger'));
    await user.click(await screen.findByText('Edit details'));

    const input = await screen.findByDisplayValue('My Assistant');
    await user.clear(input);
    await user.type(input, 'Renamed');
    await user.click(screen.getByText('Save'));

    expect(props.onRenamed).toHaveBeenCalledWith('proj-1', 'Renamed');
    await waitFor(() =>
      expect(mockRename).toHaveBeenCalledWith('proj-1', 'Renamed'),
    );
  });

  it('only calls onDeleted after delete succeeds', async () => {
    let resolveDelete: (value: { success: boolean }) => void = () => {};
    mockDelete.mockImplementationOnce(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByTestId('assistant-menu-trigger'));
    await user.click(await screen.findByText('Delete'));

    expect(props.onDeleted).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();

    const confirmButtons = await screen.findAllByText('Delete');
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('proj-1'));
    // Not called yet — delete is still pending
    expect(props.onDeleted).not.toHaveBeenCalled();

    resolveDelete({ success: true });

    await waitFor(() => expect(props.onDeleted).toHaveBeenCalledWith('proj-1'));
  });

  it('does not call onDeleted when delete fails', async () => {
    mockDelete.mockResolvedValueOnce({ success: false });
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByTestId('assistant-menu-trigger'));
    await user.click(await screen.findByText('Delete'));
    const confirmButtons = await screen.findAllByText('Delete');
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('proj-1'));
    expect(props.onDeleted).not.toHaveBeenCalled();
  });

  it('rolls back rename on failure', async () => {
    mockRename.mockResolvedValueOnce({ success: false });
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByTestId('assistant-menu-trigger'));
    await user.click(await screen.findByText('Edit details'));

    const input = await screen.findByDisplayValue('My Assistant');
    await user.clear(input);
    await user.type(input, 'Renamed');
    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(props.onRenamed).toHaveBeenNthCalledWith(1, 'proj-1', 'Renamed');
      expect(props.onRenamed).toHaveBeenNthCalledWith(
        2,
        'proj-1',
        'My Assistant',
      );
    });
  });
});
