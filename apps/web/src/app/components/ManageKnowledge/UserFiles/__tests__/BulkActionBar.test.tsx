import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { BulkActionBar } from '../BulkActionBar';

const messages = {
  'bulk-action-bar': {
    'aria-label': 'Bulk file operations',
    selected: '{count, plural, one {# selected} other {# selected}}',
    clear: 'Clear selection',
    delete: 'Delete',
    move: 'Move to folder',
    share: 'Share',
    'change-policy': 'Change policy',
    reembed: 'Reprocess',
  },
};

function renderBar(props: Partial<React.ComponentProps<typeof BulkActionBar>>) {
  const handlers = {
    onClear: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
    onShare: vi.fn(),
    onChangePolicy: vi.fn(),
    onReembed: vi.fn(),
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BulkActionBar
        selectedCount={2}
        canChangePolicy
        {...handlers}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return handlers;
}

describe('BulkActionBar', () => {
  it('renders nothing when nothing is selected', () => {
    renderBar({ selectedCount: 0 });

    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
  });

  /**
   * Phase 7's bar is Move to folder / Change policy / Reprocess / Delete.
   * The words matter as much as the buttons: "Move" and "Re-embed" named an
   * implementation, and the design names the outcome.
   */
  it('offers the four phase 7 actions, plus Share', async () => {
    renderBar({});

    expect(
      screen.getByRole('button', { name: 'Move to folder' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change policy' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reprocess' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('asks for a policy change when Change policy is pressed', async () => {
    const handlers = renderBar({});

    await userEvent.click(screen.getByTestId('bulk-change-policy'));

    expect(handlers.onChangePolicy).toHaveBeenCalledTimes(1);
  });

  /**
   * The per-row policy select renders behind the same capability and the
   * server action refuses without it, so offering the button to a member
   * would be an offer the panel cannot keep.
   */
  it('offers no policy change to someone who cannot manage the organization', () => {
    renderBar({ canChangePolicy: false });

    expect(screen.queryByTestId('bulk-change-policy')).not.toBeInTheDocument();
    expect(screen.getByTestId('bulk-move')).toBeInTheDocument();
  });

  it('leads with the count, because it says what the actions act on', () => {
    renderBar({ selectedCount: 7 });

    expect(screen.getByTestId('bulk-selected-count')).toHaveTextContent(
      '7 selected',
    );
  });

  it('disables every action while one is running', () => {
    renderBar({ isLoading: true });

    for (const id of [
      'bulk-move',
      'bulk-share',
      'bulk-change-policy',
      'bulk-reembed',
      'bulk-delete',
    ]) {
      expect(screen.getByTestId(id)).toBeDisabled();
    }
  });
});
