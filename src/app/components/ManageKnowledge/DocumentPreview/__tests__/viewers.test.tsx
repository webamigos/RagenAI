import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

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
  },
};

const wrap = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="pl" messages={messages}>
    {ui}
  </NextIntlClientProvider>
);

// --- UnsupportedViewer ---
import { UnsupportedViewer } from '../viewers/UnsupportedViewer';

describe('UnsupportedViewer', () => {
  it('pokazuje placeholder i przycisk pobierania', () => {
    render(wrap(<UnsupportedViewer fileId="abc" fileName="test.epub" />));
    expect(screen.getByText('Podgląd niedostępny')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /pobierz/i });
    expect(link).toHaveAttribute('href', '/api/files/abc');
  });
});

// --- ImageViewer ---
import { ImageViewer } from '../viewers/ImageViewer';

describe('ImageViewer', () => {
  it('renderuje img z poprawnym src', () => {
    render(
      wrap(<ImageViewer contentUrl="/api/files/img1" fileName="photo.png" />),
    );
    const img = screen.getByRole('img', { name: 'photo.png' });
    expect(img).toHaveAttribute('src', '/api/files/img1');
  });
});

// --- PlainTextViewer ---
import { PlainTextViewer } from '../viewers/PlainTextViewer';

describe('PlainTextViewer', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'hello world',
    } as Response);
  });

  it('pokazuje spinner podczas ładowania', () => {
    render(wrap(<PlainTextViewer contentUrl="/api/files/txt1" />));
    expect(screen.getByText('Ładowanie...')).toBeInTheDocument();
  });

  it('pokazuje treść po załadowaniu', async () => {
    render(wrap(<PlainTextViewer contentUrl="/api/files/txt1" />));
    await waitFor(() => {
      expect(screen.getByText('hello world')).toBeInTheDocument();
    });
  });

  it('pokazuje błąd gdy fetch się nie powiedzie', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    render(wrap(<PlainTextViewer contentUrl="/api/files/txt1" />));
    await waitFor(() => {
      expect(
        screen.getByText('Nie udało się załadować pliku.'),
      ).toBeInTheDocument();
    });
  });
});

// --- MarkdownViewer ---
import { MarkdownViewer } from '../viewers/MarkdownViewer';

describe('MarkdownViewer', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '# Tytuł\n\nTreść dokumentu.',
    } as Response);
  });

  it('pokazuje spinner podczas ładowania', () => {
    render(wrap(<MarkdownViewer contentUrl="/api/files/md1" />));
    expect(screen.getByText('Ładowanie...')).toBeInTheDocument();
  });

  it('renderuje markdown jako HTML po załadowaniu', async () => {
    render(wrap(<MarkdownViewer contentUrl="/api/files/md1" />));
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Tytuł' }),
      ).toBeInTheDocument();
    });
  });
});

// --- DocxViewer ---
import { DocxViewer } from '../viewers/DocxViewer';

vi.mock('mammoth', () => ({
  default: {
    convertToHtml: vi.fn().mockResolvedValue({ value: '<p>Dokument DOCX</p>' }),
  },
}));

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}));

describe('DocxViewer', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);
  });

  it('pokazuje spinner podczas ładowania', () => {
    render(wrap(<DocxViewer contentUrl="/api/files/docx1" />));
    expect(screen.getByText('Ładowanie...')).toBeInTheDocument();
  });

  it('renderuje treść DOCX po konwersji', async () => {
    render(wrap(<DocxViewer contentUrl="/api/files/docx1" />));
    await waitFor(() => {
      expect(screen.getByText('Dokument DOCX')).toBeInTheDocument();
    });
  });
});
