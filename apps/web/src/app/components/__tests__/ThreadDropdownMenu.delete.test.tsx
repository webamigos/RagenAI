import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';
import messages from '@/app/messages/en.json';

const deleteThread = vi.hoisted(() => vi.fn());
const errorToast = vi.hoisted(() => vi.fn());

vi.mock('@/features/threads/services/commands/delete-thread-command', () => ({
  deleteThreadCommand: deleteThread,
}));
vi.mock('@/features/threads/services/commands/rename-thread-command', () => ({
  renameThreadCommand: vi.fn(),
}));
vi.mock(
  '@/features/threads/services/commands/toggle-thread-starred-command',
  () => ({
    toggleThreadStarredCommand: vi.fn(),
  }),
);
vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    errorToast,
    successToast: vi.fn(),
    infoToast: vi.fn(),
  }),
}));
vi.mock('@/app/components/ShareThreadDialog', () => ({
  ShareThreadDialog: () => null,
}));
vi.mock('@/app/components/PublicShareDialog', () => ({
  PublicShareDialog: () => null,
}));

import { ThreadDropdownMenu } from '../ThreadDropdownMenu';

const t = messages['thread-actions'];
const thread = { id: 't1', isStarred: false, title: 'Refunds' };

function show(deleteThreads: boolean, onDeleted = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrgFeaturesProvider features={{ ...DEFAULT_FEATURES, deleteThreads }}>
        <ThreadDropdownMenu thread={thread} onDeleted={onDeleted} />
      </OrgFeaturesProvider>
    </NextIntlClientProvider>,
  );
  return onDeleted;
}

const openMenu = () =>
  userEvent.click(screen.getByRole('button', { name: t.menu }));

beforeEach(() => {
  deleteThread.mockReset();
  errorToast.mockReset();
});

describe('ThreadDropdownMenu — deleting', () => {
  it('offers no delete where the organization may not delete threads', async () => {
    show(false);
    await openMenu();

    expect(
      await screen.findByRole('menuitem', { name: t.rename }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: t.delete }),
    ).not.toBeInTheDocument();
  });

  it('removes the thread from the list once the server has deleted it', async () => {
    deleteThread.mockResolvedValue({ success: true });
    const onDeleted = show(true);
    await openMenu();
    await userEvent.click(
      await screen.findByRole('menuitem', { name: t.delete }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: t.delete }),
    );

    expect(deleteThread).toHaveBeenCalledWith('t1');
    expect(onDeleted).toHaveBeenCalledWith('t1');
  });

  it('keeps the thread in the list and says so when the server refuses', async () => {
    deleteThread.mockResolvedValue({
      success: false,
      errorMessage: 'This organization cannot delete threads',
    });
    const onDeleted = show(true);
    await openMenu();
    await userEvent.click(
      await screen.findByRole('menuitem', { name: t.delete }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: t.delete }),
    );

    expect(onDeleted).not.toHaveBeenCalled();
    expect(errorToast).toHaveBeenCalledWith({ message: t['delete-error'] });
  });
});
