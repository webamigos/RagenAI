import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { ShareAccessDialog } from '../ShareAccessDialog';

/**
 * The dialog must fetch its permission list once per open, not once per render.
 *
 * A demo user opened the share dialog and got a stack of "Nie udało się
 * udostępnić" toasts without clicking anything. The single failing request was
 * incidental — the storm was a render loop: `loadPermissions` is a
 * `useCallback` depending on `errorToast`, the effect depends on
 * `loadPermissions`, and every state update the effect caused produced a fresh
 * `errorToast` and so a fresh `loadPermissions`. On the happy path the same
 * loop ran silently as an unbounded request storm.
 *
 * **This file deliberately uses the real `statusToast`.** The sibling suite
 * mocks it with module-level `vi.fn()`s, which are stable across calls — a
 * test double steadier than the thing it stands for, which is exactly why the
 * loop survived a suite that already covered this component. Only `sonner` is
 * mocked here, so the identity behaviour under test is the real one.
 */

const mockGetProjectPermissions = vi.fn();
const mockGetOrgMembersAndTeams = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/app/actions/project-permissions', () => ({
  shareProject: vi.fn(),
  revokeProjectShare: vi.fn(),
  getProjectPermissions: (...args: unknown[]) =>
    mockGetProjectPermissions(...args),
}));

vi.mock('@/app/actions/permissions', () => ({
  getOrgMembersAndTeams: (...args: unknown[]) =>
    mockGetOrgMembersAndTeams(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: (...args: unknown[]) => mockToastError(...args),
    info: vi.fn(),
    warning: vi.fn(),
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

const renderDialog = () =>
  render(
    <NextIntlClientProvider messages={messages} locale="en">
      <ShareAccessDialog
        isOpen
        onClose={vi.fn()}
        projectId="proj-1"
        projectTitle="Default Assistant"
      />
    </NextIntlClientProvider>,
  );

/** Long enough for a runaway effect to iterate many times if one exists. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOrgMembersAndTeams.mockResolvedValue({ members: [], teams: [] });
});

describe('ShareAccessDialog does not re-fetch on every render', () => {
  it('loads the permission list once when the request succeeds', async () => {
    mockGetProjectPermissions.mockResolvedValue([]);

    renderDialog();

    await waitFor(() => expect(mockGetProjectPermissions).toHaveBeenCalled());
    await settle();

    expect(mockGetProjectPermissions).toHaveBeenCalledTimes(1);
  });

  it('shows one toast, not a waterfall, when the request fails', async () => {
    // The reported symptom. Before the fix this grew for as long as the dialog
    // stayed open, so an assertion on an exact count is the whole point.
    mockGetProjectPermissions.mockRejectedValue(new Error('500'));

    renderDialog();

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    await settle();

    expect(mockGetProjectPermissions).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledWith('Failed to share');
  });

  it('still renders the dialog after a failed load', async () => {
    mockGetProjectPermissions.mockRejectedValue(new Error('500'));

    renderDialog();
    await settle();

    // A failed permission fetch must not take the dialog down with it — the
    // user can still close it, and still see who they were about to share to.
    // `getAllByText`, because the component renders the title twice: once as
    // the visible heading and once as the dialog's accessible description.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getAllByText('Share "Default Assistant"').length,
    ).toBeGreaterThan(0);
  });
});
