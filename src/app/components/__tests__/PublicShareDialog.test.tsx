import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { PublicShareDialog } from '../PublicShareDialog';

vi.mock('@/app/actions/thread-public-links', () => ({
  getPublicLinkAction: vi.fn(),
  createPublicLinkAction: vi.fn(),
  revokePublicLinkAction: vi.fn(),
}));

import {
  getPublicLinkAction,
  createPublicLinkAction,
  revokePublicLinkAction as _revokePublicLinkAction,
} from '@/app/actions/thread-public-links';

const messages = {
  'thread-actions': {
    'public-share-title': 'Public link',
    'public-share-description': 'Anyone with the link can view this thread',
    'public-share-expires': 'Expiration',
    'public-share-expires-24h': '24 hours',
    'public-share-expires-7d': '7 days',
    'public-share-expires-30d': '30 days',
    'public-share-expires-never': 'Never',
    'public-share-password': 'Password (optional)',
    'public-share-password-placeholder': 'Leave empty for no password',
    'public-share-generate': 'Generate link',
    'public-share-copy': 'Copy link',
    'public-share-copied': 'Copied!',
    'public-share-revoke': 'Revoke link',
    'public-share-revoke-confirm': 'Are you sure?',
    'public-share-expires-on': 'Expires: {date}',
    'public-share-never-expires': 'Never expires',
    'public-share-has-password': 'Password protected',
    'public-share-no-password': 'No password',
    'public-share-error': 'Failed to create public link',
    'public-share-revoke-error': 'Failed to revoke public link',
    cancel: 'Cancel',
  },
};

function renderDialog(props = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PublicShareDialog
        isOpen={true}
        onClose={vi.fn()}
        threadId="thread-1"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('PublicShareDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows generate form when no existing link', async () => {
    vi.mocked(getPublicLinkAction).mockResolvedValue(null);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('Generate link')).toBeTruthy();
    });
  });

  it('shows active link info when link exists', async () => {
    vi.mocked(getPublicLinkAction).mockResolvedValue({
      publicId: 'pub-id',
      threadId: 'thread-1',
      threadTitle: 'My Thread',
      expiresAt: null,
      hasPassword: false,
      createdAt: new Date().toISOString(),
    });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('Copy link')).toBeTruthy();
      expect(screen.getByText('Revoke link')).toBeTruthy();
    });
  });

  it('calls createPublicLinkAction on generate', async () => {
    vi.mocked(getPublicLinkAction).mockResolvedValue(null);
    vi.mocked(createPublicLinkAction).mockResolvedValue({
      success: true,
      publicId: 'new-pub-id',
    });
    vi.mocked(getPublicLinkAction)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        publicId: 'new-pub-id',
        threadId: 'thread-1',
        threadTitle: null,
        expiresAt: null,
        hasPassword: false,
        createdAt: new Date().toISOString(),
      });

    renderDialog();

    await waitFor(() => screen.getByText('Generate link'));
    fireEvent.click(screen.getByText('Generate link'));

    await waitFor(() => {
      expect(createPublicLinkAction).toHaveBeenCalledWith(
        'thread-1',
        expect.anything(),
        undefined,
      );
    });
  });
});
