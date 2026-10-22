import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/app/messages/en.json';

import { ThreadRetentionSetting } from '../ThreadRetentionSetting';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  successToast: vi.fn(),
  errorToast: vi.fn(),
}));

vi.mock('@/app/actions', () => ({
  saveThreadRetentionAction: mocks.save,
}));

vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    successToast: mocks.successToast,
    errorToast: mocks.errorToast,
    infoToast: vi.fn(),
    warningToast: vi.fn(),
  }),
}));

// The real English messages, so the test reads what a person reads — and
// fails if a key the component calls is missing.
const messages = {
  common: en.common,
  'thread-retention': en['thread-retention'],
};

function renderSetting(initialDays: 30 | 90 | 180 | 365 | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThreadRetentionSetting initialDays={initialDays} />
    </NextIntlClientProvider>,
  );
}

const saveButton = () =>
  screen.getByRole('button', { name: 'Save retention period' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockImplementation(async (days: number | null) => ({
    success: true,
    threadRetentionDays: days,
  }));
});

describe('ThreadRetentionSetting', () => {
  it('says plainly what happens, and that it is off by default', () => {
    renderSetting(null);

    expect(screen.getByText(/Deletion is permanent/)).toBeInTheDocument();
    expect(screen.getByText(/runs once a day/)).toBeInTheDocument();
    expect(
      screen.getByText(/including shared, starred, chatbot and API/),
    ).toBeInTheDocument();
    expect(screen.getByTestId('thread-retention-current')).toHaveTextContent(
      'Currently off',
    );
    expect(screen.getByRole('radio', { name: /^Off/ })).toBeChecked();
  });

  it('offers exactly off and the four presets', () => {
    renderSetting(null);

    expect(screen.getAllByRole('radio')).toHaveLength(5);
    for (const days of [30, 90, 180, 365]) {
      expect(
        screen.getByRole('radio', { name: new RegExp(`^${days} days`) }),
      ).toBeInTheDocument();
    }
  });

  it('shows the stored period', () => {
    renderSetting(90);

    expect(screen.getByTestId('thread-retention-current')).toHaveTextContent(
      'threads are deleted after 90 days without a new message',
    );
    expect(screen.getByRole('radio', { name: /^90 days/ })).toBeChecked();
  });

  it('has nothing to save until the choice changes', () => {
    renderSetting(90);

    expect(saveButton()).toBeDisabled();
  });

  describe('turning it on', () => {
    it('asks for confirmation, and saves only once confirmed', async () => {
      const user = userEvent.setup();
      renderSetting(null);

      await user.click(screen.getByRole('radio', { name: /^30 days/ }));
      await user.click(saveButton());

      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveTextContent('Delete threads after 30 days?');
      expect(dialog).toHaveTextContent('permanently deleted');
      expect(mocks.save).not.toHaveBeenCalled();

      await user.click(
        screen.getByRole('button', { name: 'Delete after 30 days' }),
      );

      await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(30));
      expect(mocks.successToast).toHaveBeenCalled();
      expect(screen.getByTestId('thread-retention-current')).toHaveTextContent(
        'after 30 days',
      );
    });

    it('saves nothing when the confirmation is cancelled', async () => {
      const user = userEvent.setup();
      renderSetting(null);

      await user.click(screen.getByRole('radio', { name: /^365 days/ }));
      await user.click(saveButton());
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mocks.save).not.toHaveBeenCalled();
      expect(screen.getByTestId('thread-retention-current')).toHaveTextContent(
        'Currently off',
      );
    });
  });

  it('asks for confirmation when shortening the period', async () => {
    const user = userEvent.setup();
    renderSetting(365);

    await user.click(screen.getByRole('radio', { name: /^90 days/ }));
    await user.click(saveButton());

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Delete threads after 90 days?',
    );
  });

  // Neither deletes anything that was not already going.
  it.each([
    ['lengthening', 30, /^180 days/, 180],
    ['turning off', 90, /^Off/, null],
  ] as const)(
    'saves directly when %s',
    async (_label, initial, option, expected) => {
      const user = userEvent.setup();
      renderSetting(initial);

      await user.click(screen.getByRole('radio', { name: option }));
      await user.click(saveButton());

      await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expected));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    },
  );

  it('explains a refusal and keeps the stored period', async () => {
    mocks.save.mockResolvedValue({
      success: false,
      error: 'save-failed',
    });
    const user = userEvent.setup();
    renderSetting(null);

    await user.click(screen.getByRole('radio', { name: /^90 days/ }));
    await user.click(saveButton());
    await user.click(
      await screen.findByRole('button', { name: 'Delete after 90 days' }),
    );

    await waitFor(() =>
      expect(mocks.errorToast).toHaveBeenCalledWith({
        message: expect.stringContaining('something went wrong'),
      }),
    );
    expect(screen.getByTestId('thread-retention-current')).toHaveTextContent(
      'Currently off',
    );
  });

  it('explains a refusal for a member', async () => {
    mocks.save.mockResolvedValue({ success: false, error: 'forbidden' });
    const user = userEvent.setup();
    renderSetting(90);

    await user.click(screen.getByRole('radio', { name: /^Off/ }));
    await user.click(saveButton());

    await waitFor(() =>
      expect(mocks.errorToast).toHaveBeenCalledWith({
        message: expect.stringContaining('only an organization owner or admin'),
      }),
    );
  });
});
