import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PiiIngestionModeSwitch } from '../PiiIngestionModeSwitch';

const { mockSaveAction } = vi.hoisted(() => ({
  mockSaveAction: vi.fn(),
}));

vi.mock('@/app/actions', () => ({
  savePiiIngestionModeAction: mockSaveAction,
}));

const mockSuccessToast = vi.fn();
const mockErrorToast = vi.fn();

vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    successToast: mockSuccessToast,
    errorToast: mockErrorToast,
    infoToast: vi.fn(),
    warningToast: vi.fn(),
  }),
}));

const messages = {
  'pii-policy': {
    'ingestion-mode-title': 'Ingestion mode',
    'ingestion-mode-description': 'Description',
    'ingestion-mode-destructive-label': 'Destructive',
    'ingestion-mode-destructive-description': 'Destructive desc',
    'ingestion-mode-dual-content-label': 'Dual-content',
    'ingestion-mode-dual-content-description': 'Dual-content desc',
    'ingestion-mode-saved': 'Saved',
    'ingestion-mode-error': 'Failed to save',
  },
};

function renderSwitch(
  initialMode: 'destructive' | 'dual_content' = 'destructive',
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PiiIngestionModeSwitch initialMode={initialMode} />
    </NextIntlClientProvider>,
  );
}

describe('PiiIngestionModeSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with initial mode selected', () => {
    renderSwitch('destructive');
    const destructiveRadio = screen.getByRole('radio', {
      name: /destructive/i,
    });
    expect(destructiveRadio).toBeChecked();
  });

  it('calls savePiiIngestionModeAction when mode changes', async () => {
    mockSaveAction.mockResolvedValue(undefined);
    renderSwitch('destructive');
    const dualContentRadio = screen.getByRole('radio', {
      name: /dual-content/i,
    });
    await userEvent.click(dualContentRadio);
    await waitFor(() =>
      expect(mockSaveAction).toHaveBeenCalledWith('dual_content'),
    );
  });

  it('shows success toast on save', async () => {
    mockSaveAction.mockResolvedValue(undefined);
    renderSwitch('destructive');
    await userEvent.click(screen.getByRole('radio', { name: /dual-content/i }));
    await waitFor(() =>
      expect(mockSuccessToast).toHaveBeenCalledWith({ message: 'Saved' }),
    );
  });

  it('reverts mode and shows error toast on failure', async () => {
    mockSaveAction.mockRejectedValue(new Error('network error'));
    renderSwitch('destructive');
    await userEvent.click(screen.getByRole('radio', { name: /dual-content/i }));
    await waitFor(() =>
      expect(mockErrorToast).toHaveBeenCalledWith({
        message: 'Failed to save',
      }),
    );
    const destructiveRadio = screen.getByRole('radio', {
      name: /destructive/i,
    });
    expect(destructiveRadio).toBeChecked();
  });
});
