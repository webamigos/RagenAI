import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const mockUploadScoringFile = vi.fn();
const mockRemoveScoringFile = vi.fn();
vi.mock('@/app/actions/leads', () => ({
  uploadScoringFile: (...a: unknown[]) => mockUploadScoringFile(...a),
  removeScoringFile: (...a: unknown[]) => mockRemoveScoringFile(...a),
}));

const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => mockToastError(...a) },
}));

const messages = {
  'leads-page': {
    'scoring-file-label': 'Scoring criteria file',
    'scoring-file-upload': 'Upload file',
    'scoring-file-replace': 'Replace',
    'scoring-file-remove': 'Remove',
    'scoring-file-none': 'No scoring file uploaded',
    'scoring-file-uploading': 'Uploading…',
    'scoring-file-error-type': 'Only PDF and DOCX files are supported',
    'scoring-file-error-size': 'File must be smaller than 20 MB',
    'score-failed': 'Scoring failed',
  },
};

const { ScoringFileUpload } = await import('../ScoringFileUpload');

function renderWidget(props = {}) {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <ScoringFileUpload
        leadListPublicId="list-uuid"
        currentFileName={null}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('ScoringFileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToastError.mockClear();
  });

  it('shows the upload button when no file is attached', () => {
    renderWidget();
    expect(screen.getByText('Upload file')).toBeInTheDocument();
  });

  it('shows the current file name and a kebab menu with Replace/Remove', async () => {
    renderWidget({ currentFileName: 'VHS_scoring.pdf' });
    expect(screen.getByText('VHS_scoring.pdf')).toBeInTheDocument();
    // The Replace / Remove labels live behind the kebab menu now.
    expect(screen.queryByText('Replace')).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Scoring criteria file' }),
    );
    expect(await screen.findByText('Replace')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('calls removeScoringFile when Remove is clicked from the menu', async () => {
    mockRemoveScoringFile.mockResolvedValue(undefined);
    renderWidget({ currentFileName: 'VHS_scoring.pdf' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Scoring criteria file' }),
    );
    await userEvent.click(await screen.findByText('Remove'));

    await waitFor(() =>
      expect(mockRemoveScoringFile).toHaveBeenCalledWith({
        leadListPublicId: 'list-uuid',
      }),
    );
  });

  it('rejects non-PDF/DOCX files before upload (toast, no action call)', async () => {
    renderWidget();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(['content'], 'data.xlsx', {
      type: 'application/vnd.ms-excel',
    });
    // applyAccept: false bypasses user-event's filtering on the input's
    // accept attribute so our JS-side validation actually runs.
    await userEvent.upload(input, file, { applyAccept: false });
    expect(mockToastError).toHaveBeenCalledWith(
      'Only PDF and DOCX files are supported',
    );
    expect(mockUploadScoringFile).not.toHaveBeenCalled();
  });
});
