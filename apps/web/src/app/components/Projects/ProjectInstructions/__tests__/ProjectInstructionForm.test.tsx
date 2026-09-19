import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { ProjectInstructionForm } from '../ProjectInstructionForm';

const mockSaveProjectInstruction = vi.fn();
const mockGetProjectInstruction = vi.fn();
const mockSuccessToast = vi.fn();
const mockErrorToast = vi.fn();

vi.mock('../actions', () => ({
  saveProjectInstructionAction: (...args: unknown[]) =>
    mockSaveProjectInstruction(...args),
  getProjectInstructionAction: (...args: unknown[]) =>
    mockGetProjectInstruction(...args),
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
  projects: {
    'project-instructions': {
      'description-label': 'Instruction',
      'description-min-length': 'At least 10 characters',
      placeholder: 'How should the assistant answer?',
      'instruction-saved': 'Instruction saved',
      'save-error': 'Could not save the instruction',
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
    },
  },
};

const renderForm = (props = {}) =>
  render(
    <NextIntlClientProvider messages={messages} locale="en">
      <ProjectInstructionForm projectId="proj-1" {...props} />
    </NextIntlClientProvider>,
  );

const INSTRUCTION = 'Answer in Polish, and cite the source document.';

describe('ProjectInstructionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProjectInstruction.mockResolvedValue({
      success: true,
      instruction: null,
    });
    mockSaveProjectInstruction.mockResolvedValue({
      success: true,
      message: 'ok',
    });
  });

  it('keeps the saved text in the box instead of blanking it', async () => {
    const user = userEvent.setup();
    renderForm();

    const textarea = await screen.findByRole('textbox');
    await user.type(textarea, INSTRUCTION);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockSaveProjectInstruction).toHaveBeenCalledWith(
        'proj-1',
        INSTRUCTION,
      ),
    );
    expect(mockSuccessToast).toHaveBeenCalledWith({
      message: 'Instruction saved',
    });

    // The regression: a bare `reset()` returned the field to its empty
    // `defaultValues`, so the instruction vanished at the moment it was saved.
    await waitFor(() => expect(textarea).toHaveValue(INSTRUCTION));
  });

  it('loads the stored instruction into the box', async () => {
    mockGetProjectInstruction.mockResolvedValue({
      success: true,
      instruction: INSTRUCTION,
    });

    renderForm();

    await waitFor(() =>
      expect(screen.getByRole('textbox')).toHaveValue(INSTRUCTION),
    );
  });

  it('reports a failed save and leaves the text in place', async () => {
    const user = userEvent.setup();
    mockSaveProjectInstruction.mockResolvedValue({
      success: false,
      message: 'Failed to save project instruction',
    });

    renderForm();

    const textarea = await screen.findByRole('textbox');
    await user.type(textarea, INSTRUCTION);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockErrorToast).toHaveBeenCalledWith({
        message: 'Could not save the instruction',
      }),
    );
    expect(textarea).toHaveValue(INSTRUCTION);
  });

  it('does not submit a non-empty instruction shorter than ten characters', async () => {
    const user = userEvent.setup();
    renderForm();

    const textarea = await screen.findByRole('textbox');
    await user.type(textarea, 'too short');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('At least 10 characters');
    expect(mockSaveProjectInstruction).not.toHaveBeenCalled();
  });
});
