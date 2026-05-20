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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
  beforeEach(() => vi.clearAllMocks());

  it('shows "no file" state when no file is uploaded', () => {
    renderWidget();
    expect(screen.getByText('No scoring file uploaded')).toBeInTheDocument();
    expect(screen.getByText('Upload file')).toBeInTheDocument();
  });

  it('shows current file name and Replace/Remove buttons when file exists', () => {
    renderWidget({ currentFileName: 'VHS_scoring.pdf' });
    expect(screen.getByText('VHS_scoring.pdf')).toBeInTheDocument();
    expect(screen.getByText('Replace')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('calls removeScoringFile when Remove is clicked', async () => {
    mockRemoveScoringFile.mockResolvedValue(undefined);
    renderWidget({ currentFileName: 'VHS_scoring.pdf' });
    await userEvent.click(screen.getByText('Remove'));
    await waitFor(() =>
      expect(mockRemoveScoringFile).toHaveBeenCalledWith({
        leadListPublicId: 'list-uuid',
      }),
    );
  });

  it('rejects non-PDF/DOCX files before upload', async () => {
    renderWidget();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(['content'], 'data.xlsx', {
      type: 'application/vnd.ms-excel',
    });
    await userEvent.upload(input, file);
    expect(
      screen.getByText('Only PDF and DOCX files are supported'),
    ).toBeInTheDocument();
    expect(mockUploadScoringFile).not.toHaveBeenCalled();
  });
});
