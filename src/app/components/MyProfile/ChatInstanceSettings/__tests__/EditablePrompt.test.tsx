import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { EditablePrompt } from '../EditablePrompt';
import { ASSISTANT_PROMPT_MAX_LENGTH } from '@/features/assistants/constants/limits';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../actions', () => ({
  fetchSettings: vi.fn().mockResolvedValue({
    success: false,
    message: 'No API Key found',
  }),
  saveSetting: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
}));

vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    successToast: vi.fn(),
    errorToast: vi.fn(),
  }),
}));

const messages = {
  'assistant-settings': {
    'editable-prompt': {
      title: 'Prompt',
      label: 'Label',
      update: 'Update',
      'failed-to-update-prompt': 'Error',
      'prompt-updated-successfully': 'Updated',
      'no-changes-detected': 'No changes',
      placeholder: 'Enter prompt...',
      'description-min-length': 'Min 25 chars',
      'char-limit-exceeded': `Exceeds {limit} chars`,
      'char-counter-tooltip': 'Longer prompt = higher cost',
    },
  },
  'text-area': {
    placeholder: 'Type your question...',
  },
};

function renderComponent() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditablePrompt />
    </NextIntlClientProvider>,
  );
}

describe('EditablePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders char counter starting at 0', async () => {
    renderComponent();
    expect(
      await screen.findByText(`0 / ${ASSISTANT_PROMPT_MAX_LENGTH}`),
    ).toBeInTheDocument();
  });

  it('updates char counter as user types', async () => {
    const user = userEvent.setup();
    renderComponent();

    const textarea = await screen.findByRole('textbox');
    await act(async () => {
      await user.type(textarea, 'Hello');
    });

    expect(
      screen.getByText(`5 / ${ASSISTANT_PROMPT_MAX_LENGTH}`),
    ).toBeInTheDocument();
  });

  it('disables Save button when prompt exceeds limit', async () => {
    renderComponent();

    const textarea = await screen.findByRole('textbox');
    const overLimitText = 'a'.repeat(ASSISTANT_PROMPT_MAX_LENGTH + 1);

    await act(async () => {
      fireEvent.change(textarea, { target: { value: overLimitText } });
    });

    const saveBtn = screen.getByRole('button', { name: 'Update' });
    expect(saveBtn).toBeDisabled();
  });

  it('enables Save button when prompt is within limit', async () => {
    const user = userEvent.setup();
    renderComponent();

    const textarea = await screen.findByRole('textbox');
    await act(async () => {
      await user.type(textarea, 'This is a valid prompt with enough chars');
    });

    const saveBtn = screen.getByRole('button', { name: 'Update' });
    expect(saveBtn).not.toBeDisabled();
  });

  it('shows tooltip on counter icon', async () => {
    renderComponent();
    const tooltip = await screen.findByTitle('Longer prompt = higher cost');
    expect(tooltip).toBeInTheDocument();
  });
});
