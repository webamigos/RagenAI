import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OptimizeFilesDialog } from '../OptimizeFilesDialog';
import messages from '@/app/messages/en.json';
import type { UserFileType } from '@/features/documents/contracts/document.types';
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/app/lib/utils/logger', () => ({ logger: { warn: vi.fn() } }));
const file = (
  id: string,
  fileType: UserFileType['fileType'] = 'DOCX',
): UserFileType => ({
  id,
  organizationId: 'org',
  fileName: `${id}.docx`,
  fileSize: 10,
  fileType,
  projectId: null,
  project: null,
  embeddingStatus: 'COMPLETED',
  document: { id: `doc-${id}` },
});
afterEach(() => vi.unstubAllGlobals());
describe('optimization confirmation and partial retry', () => {
  it('requires confirmation, skips spreadsheets and retries only failed requests', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', request);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OptimizeFilesDialog
          files={[file('one'), file('two'), file('sheet', 'XLSX')]}
          onClose={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByText(/Skipped: 1/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Prepare suggestions' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Started: 1. Failed: 1.',
      ),
    );
    expect(request).toHaveBeenCalledTimes(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry failed requests' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Started: 2. Failed: 0.',
      ),
    );
    expect(request.mock.calls[2][0]).toBe(
      '/api/documents/doc-two/optimize-suggestions',
    );
    expect(
      screen.getAllByRole('link', { name: 'Review suggestions' }),
    ).toHaveLength(2);
  });
  it('cannot start a queue with no supported documents', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OptimizeFilesDialog
          files={[file('sheet', 'XLSX')]}
          onClose={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole('button', { name: 'Prepare suggestions' }),
    ).toBeDisabled();
  });
});
