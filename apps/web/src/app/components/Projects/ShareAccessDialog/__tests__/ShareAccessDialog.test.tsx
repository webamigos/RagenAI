import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { ShareAccessDialog } from '../ShareAccessDialog';

const mockShareProject = vi.fn();
const mockRevokeProjectShare = vi.fn();
const mockGetProjectPermissions = vi.fn();
const mockGetOrgMembersAndTeams = vi.fn();
const mockSuccessToast = vi.fn();
const mockErrorToast = vi.fn();

vi.mock('@/app/actions/project-permissions', () => ({
  shareProject: (...args: unknown[]) => mockShareProject(...args),
  revokeProjectShare: (...args: unknown[]) => mockRevokeProjectShare(...args),
  getProjectPermissions: (...args: unknown[]) =>
    mockGetProjectPermissions(...args),
}));

vi.mock('@/app/actions/permissions', () => ({
  getOrgMembersAndTeams: (...args: unknown[]) =>
    mockGetOrgMembersAndTeams(...args),
}));

vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    successToast: mockSuccessToast,
    errorToast: mockErrorToast,
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
  'share-access-dialog': {
    title: 'Share "{title}"',
    'search-placeholder': 'Type name or email',
    'permission-view': 'View only',
    'permission-full': 'Full access',
    'team-badge': 'Team',
    'who-has-access': 'Who has access',
    owner: 'Owner',
    remove: 'Remove',
    done: 'Done',
    cancel: 'Cancel',
    'shared-success': 'Shared successfully',
    'share-failed': 'Failed to share',
    'owner-already-has-access': 'Owner already has full access',
    'user-not-org-member': 'User is not a member of this organization',
    'team-not-found': 'Team not found',
    'revoke-success': 'Access revoked',
    'revoke-failed': 'Failed to revoke access',
    'empty-list': 'No other members',
  },
};

class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver =
  ResizeObserverPolyfill as unknown as typeof ResizeObserver;

const renderDialog = (props = {}) =>
  render(
    <NextIntlClientProvider messages={messages} locale="en">
      <ShareAccessDialog
        isOpen
        onClose={vi.fn()}
        projectId="proj-1"
        projectTitle="Firmy"
        ownerName="Alice"
        {...props}
      />
    </NextIntlClientProvider>,
  );

describe('ShareAccessDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProjectPermissions.mockResolvedValue([]);
    mockGetOrgMembersAndTeams.mockResolvedValue({
      members: [
        { id: 'user-1', name: 'Bob', email: 'bob@example.com' },
        { id: 'user-2', name: 'Carol', email: 'carol@example.com' },
      ],
      teams: [{ id: 'team-1', name: 'General' }],
    });
    mockShareProject.mockResolvedValue({ success: true });
    mockRevokeProjectShare.mockResolvedValue({ success: true });
  });

  it('shares a user with the selected permission and reloads list', async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText('Bob');

    await user.click(screen.getByText('Bob'));

    await waitFor(() =>
      expect(mockShareProject).toHaveBeenCalledWith(
        'proj-1',
        'user',
        'user-1',
        'view',
      ),
    );
    expect(mockSuccessToast).toHaveBeenCalledWith({
      message: 'Shared successfully',
    });
    // After a successful share, permissions reload to reflect the new state.
    expect(mockGetProjectPermissions).toHaveBeenCalledTimes(2);
  });

  it('revokes an existing permission', async () => {
    mockGetProjectPermissions.mockResolvedValueOnce([
      {
        id: '42',
        granteeType: 'user',
        granteeId: 'user-1',
        granteeName: 'Bob',
        granteeEmail: 'bob@example.com',
        permission: 'view',
      },
    ]);
    const user = userEvent.setup();
    renderDialog();

    const removeButton = await screen.findByText('Remove');
    await user.click(removeButton);

    await waitFor(() =>
      expect(mockRevokeProjectShare).toHaveBeenCalledWith(42),
    );
    expect(mockSuccessToast).toHaveBeenCalledWith({
      message: 'Access revoked',
    });
  });

  it('translates backend errors to localized messages', async () => {
    mockShareProject.mockResolvedValueOnce({
      success: false,
      error: 'Owner already has full access',
    });
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText('Bob');
    await user.click(screen.getByText('Bob'));

    await waitFor(() =>
      expect(mockErrorToast).toHaveBeenCalledWith({
        message: 'Owner already has full access',
      }),
    );

    mockShareProject.mockResolvedValueOnce({
      success: false,
      error: 'User is not a member of this organization',
    });
    await user.click(screen.getByText('Carol'));
    await waitFor(() =>
      expect(mockErrorToast).toHaveBeenCalledWith({
        message: 'User is not a member of this organization',
      }),
    );
  });

  it('falls back to share-failed for unknown backend prose', async () => {
    mockShareProject.mockResolvedValueOnce({
      success: false,
      error: 'something nobody anticipated',
    });
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText('Bob');
    await user.click(screen.getByText('Bob'));

    await waitFor(() =>
      expect(mockErrorToast).toHaveBeenCalledWith({
        message: 'Failed to share',
      }),
    );
    expect(mockErrorToast).not.toHaveBeenCalledWith({
      message: 'something nobody anticipated',
    });
  });

  it('clears permissions and toasts when load fails', async () => {
    mockGetProjectPermissions.mockRejectedValueOnce(new Error('boom'));
    renderDialog();

    await waitFor(() =>
      expect(mockErrorToast).toHaveBeenCalledWith({
        message: 'Failed to share',
      }),
    );
  });
});
