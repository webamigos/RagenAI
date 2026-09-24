import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { DocumentPreviewSlideOver } from '../DocumentPreviewSlideOver';
import type { UserFileTypeSafe } from '../../UserFiles/FileList/UserFilesTable';
import { EmbeddingStatus } from '@/generated/prisma/browser';

vi.mock('../viewers/PdfViewer', () => ({ PdfViewer: () => <div>PDF</div> }));
vi.mock('../viewers/DocxViewer', () => ({ DocxViewer: () => <div>DOCX</div> }));

const messages = {
  'document-preview': {
    'unsupported-title': 'Podgląd niedostępny',
    'unsupported-description': 'Ten format pliku nie obsługuje podglądu.',
    download: 'Pobierz',
    loading: 'Ładowanie...',
    'error-loading': 'Nie udało się załadować pliku.',
    page: 'Strona',
    of: 'z',
    'zoom-in': 'Powiększ',
    'zoom-out': 'Pomniejsz',
    close: 'Zamknij',
    'prev-document': 'Poprzedni',
    'next-document': 'Następny',
    'metadata-title': 'Szczegóły',
    'actions-title': 'Akcje',
    'meta-name': 'Nazwa',
    'meta-size': 'Rozmiar',
    'meta-type': 'Typ',
    'meta-created': 'Dodano',
    'meta-status': 'Status',
    'action-download': 'Pobierz',
    'action-share': 'Udostępnij',
    'action-move': 'Przenieś',
    'action-delete': 'Usuń',
    'prev-page': 'Poprzednia strona',
    'next-page': 'Następna strona',
    'expand-width': 'Pełna szerokość',
    'collapse-width': 'Zwykła szerokość',
  },
  'files-table': {
    'status-ready': 'Gotowy',
    'status-failed': 'Błąd',
    'status-processing': 'Przetwarzanie',
  },
};

const makeFile = (
  overrides: Partial<UserFileTypeSafe> = {},
): UserFileTypeSafe => ({
  id: 'file1',
  organizationId: 'org1',
  fileName: 'test.txt',
  fileSize: 1024,
  fileType: 'TEXT',
  projectId: 'proj1',
  project: null,
  embeddingStatus: EmbeddingStatus.COMPLETED,
  embeddingStartedAt: null,
  embeddingCompletedAt: null,
  embeddingFailedAt: null,
  ...overrides,
});

const wrap = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="pl" messages={messages}>
    {ui}
  </NextIntlClientProvider>
);

describe('DocumentPreviewSlideOver', () => {
  it('nie renderuje się gdy isOpen=false', () => {
    render(
      wrap(
        <DocumentPreviewSlideOver
          file={makeFile()}
          files={[makeFile()]}
          initialIndex={0}
          isOpen={false}
          onClose={vi.fn()}
          onFileChange={vi.fn()}
          onDelete={vi.fn()}
          onShare={vi.fn()}
          onMove={vi.fn()}
        />,
      ),
    );
    expect(screen.queryByTestId('preview-overlay')).not.toBeInTheDocument();
  });

  it('renderuje się gdy isOpen=true', () => {
    render(
      wrap(
        <DocumentPreviewSlideOver
          file={makeFile()}
          files={[makeFile()]}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
          onFileChange={vi.fn()}
          onDelete={vi.fn()}
          onShare={vi.fn()}
          onMove={vi.fn()}
        />,
      ),
    );
    expect(screen.getAllByText('test.txt').length).toBeGreaterThan(0);
  });

  it('wywołuje onClose po naciśnięciu Esc', () => {
    const onClose = vi.fn();
    render(
      wrap(
        <DocumentPreviewSlideOver
          file={makeFile()}
          files={[makeFile()]}
          initialIndex={0}
          isOpen={true}
          onClose={onClose}
          onFileChange={vi.fn()}
          onDelete={vi.fn()}
          onShare={vi.fn()}
          onMove={vi.fn()}
        />,
      ),
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('wywołuje onClose po kliknięciu tła', () => {
    const onClose = vi.fn();
    render(
      wrap(
        <DocumentPreviewSlideOver
          file={makeFile()}
          files={[makeFile()]}
          initialIndex={0}
          isOpen={true}
          onClose={onClose}
          onFileChange={vi.fn()}
          onDelete={vi.fn()}
          onShare={vi.fn()}
          onMove={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId('preview-overlay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('rozszerza panel na pełną szerokość okna i zapamiętuje wybór', () => {
    window.localStorage.removeItem('ragen.preview.expanded');
    const props = {
      file: makeFile({ fileName: 'a.xlsx', fileType: 'XLSX' as const }),
      files: [makeFile()],
      initialIndex: 0,
      isOpen: true,
      onClose: vi.fn(),
      onFileChange: vi.fn(),
      onDelete: vi.fn(),
      onShare: vi.fn(),
      onMove: vi.fn(),
    };
    const { unmount } = render(wrap(<DocumentPreviewSlideOver {...props} />));

    const panel = screen.getByTestId('preview-panel');
    expect(panel.className).toContain('max-w-5xl');

    fireEvent.click(screen.getByRole('button', { name: 'Pełna szerokość' }));
    expect(panel).toHaveAttribute('data-expanded', 'true');
    expect(panel.className).toContain('w-screen');
    expect(panel.className).not.toContain('max-w-5xl');
    expect(
      screen.getByRole('button', { name: 'Zwykła szerokość' }),
    ).toHaveAttribute('aria-pressed', 'true');

    // Reopening the drawer keeps the width the reader chose.
    unmount();
    render(wrap(<DocumentPreviewSlideOver {...props} />));
    expect(screen.getByTestId('preview-panel')).toHaveAttribute(
      'data-expanded',
      'true',
    );
    window.localStorage.removeItem('ragen.preview.expanded');
  });
});
