import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnswerFromDocumentsOnly } from '../AnswerFromDocumentsOnly';

const mockGet = vi.hoisted(() => vi.fn());
const mockSave = vi.hoisted(() => vi.fn());
const mockErrorToast = vi.hoisted(() => vi.fn());

vi.mock('../actions', () => ({
  getAnswerFromDocumentsOnlyAction: (...args: unknown[]) => mockGet(...args),
  saveAnswerFromDocumentsOnlyAction: (...args: unknown[]) => mockSave(...args),
}));
vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({ errorToast: mockErrorToast }),
}));

const messages = {
  projects: {
    'project-view': {
      'answer-from-documents-only': {
        title: 'Answer only from documents',
        description: 'Say the documents do not cover it.',
        'default-chatbot': 'Default: on, chatbot enabled.',
        'default-panel': 'Default: off.',
        'set-for-assistant': 'Set for this assistant.',
        'save-failed': 'Could not save.',
      },
    },
  },
};

const renderSwitch = () =>
  render(
    <NextIntlClientProvider messages={messages} locale="en">
      <AnswerFromDocumentsOnly projectId="proj-1" />
    </NextIntlClientProvider>,
  );

const state = (overrides: object) => ({
  setting: null,
  chatbotEnabled: false,
  effective: false,
  canManage: true,
  ...overrides,
});

describe('AnswerFromDocumentsOnly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ success: true });
  });

  it.each([
    [
      { setting: null, chatbotEnabled: true, effective: true },
      true,
      'Default: on, chatbot enabled.',
    ],
    [
      { setting: null, chatbotEnabled: false, effective: false },
      false,
      'Default: off.',
    ],
    [
      { setting: false, chatbotEnabled: true, effective: false },
      false,
      'Set for this assistant.',
    ],
    [
      { setting: true, chatbotEnabled: false, effective: true },
      true,
      'Set for this assistant.',
    ],
  ])('shows the effective state of %o', async (overrides, checked, note) => {
    mockGet.mockResolvedValue(state(overrides));
    renderSwitch();

    const toggle = await screen.findByRole('switch', {
      name: 'Answer only from documents',
    });
    expect(toggle).toHaveAttribute('aria-checked', String(checked));
    expect(
      screen.getByTestId('answer-from-documents-only-note'),
    ).toHaveTextContent(note);
  });

  it('renders nothing until the state is known', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderSwitch();

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('saves the opposite of the effective state when toggled', async () => {
    mockGet.mockResolvedValue(
      state({ setting: null, chatbotEnabled: true, effective: true }),
    );
    renderSwitch();

    await userEvent.click(await screen.findByRole('switch'));

    expect(mockSave).toHaveBeenCalledWith('proj-1', false);
    await waitFor(() =>
      expect(screen.getByRole('switch')).toHaveAttribute(
        'aria-checked',
        'false',
      ),
    );
    expect(
      screen.getByTestId('answer-from-documents-only-note'),
    ).toHaveTextContent('Set for this assistant.');
  });

  it('reverts and says so when the save fails', async () => {
    mockGet.mockResolvedValue(state({ effective: false }));
    mockSave.mockResolvedValue({ success: false });
    renderSwitch();

    await userEvent.click(await screen.findByRole('switch'));

    await waitFor(() =>
      expect(mockErrorToast).toHaveBeenCalledWith({
        message: 'Could not save.',
      }),
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByTestId('answer-from-documents-only-note'),
    ).toHaveTextContent('Default: off.');
  });

  it('is read-only for someone who cannot manage the assistant', async () => {
    mockGet.mockResolvedValue(state({ canManage: false }));
    renderSwitch();

    const toggle = await screen.findByRole('switch');
    expect(toggle).toBeDisabled();
    await userEvent.click(toggle);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
