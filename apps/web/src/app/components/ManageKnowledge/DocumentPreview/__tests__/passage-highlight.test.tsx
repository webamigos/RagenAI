import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import * as XLSX from 'xlsx';

/**
 * Opening a cited source marks the passage the answer used and scrolls to it,
 * in every viewer that renders text — and says so, quietly, when it cannot.
 *
 * `scrollIntoView` is spied on the prototype: jsdom has no layout, so the
 * scroll call itself is the observable, and the element it was called on is
 * what proves the viewer scrolled to the passage and not to the top.
 */
const mammothHtml = vi.hoisted(() => ({ value: '' }));

vi.mock('mammoth', () => ({
  default: {
    convertToHtml: vi.fn(async () => ({ value: mammothHtml.value })),
  },
}));

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}));

import { PlainTextViewer } from '../viewers/PlainTextViewer';
import { MarkdownViewer } from '../viewers/MarkdownViewer';
import { DocxViewer } from '../viewers/DocxViewer';
import { XlsxViewer } from '../viewers/XlsxViewer';
import { UnsupportedViewer } from '../viewers/UnsupportedViewer';
import { UrlSourceViewer, urlFromSourceName } from '../viewers/UrlSourceViewer';

const messages = {
  'document-preview': {
    loading: 'Loading...',
    'error-loading': 'Failed to load file.',
    'passage-not-found': "Couldn't find the exact passage in this document.",
    'cited-passage': 'The passage the answer used',
    'open-original-page': 'Open the original page',
    'unsupported-title': 'Preview unavailable',
    'unsupported-description': 'This file format does not support preview.',
    download: 'Download',
    'xlsx-sheets': 'Sheets',
    'xlsx-truncated': 'Showing {shown} of {total}',
    'xlsx-empty-sheet': 'This sheet is empty.',
  },
};

const wrap = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

const serveText = (text: string) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    text: async () => text,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as Response);
};

const PASSAGE =
  'Zwrot środków następuje na rachunek wskazany przez klienta, najpóźniej w terminie 14 dni.';
const DOCUMENT = `Regulamin\n\nKlient może zwrócić towar w ciągu 14 dni.\n\n${PASSAGE}\n\nReklamacje rozpatruje dział obsługi.`;

let scrollSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollSpy = vi.fn();
  Element.prototype.scrollIntoView = scrollSpy as never;
});

afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

const markText = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('mark'))
    .map((mark) => mark.textContent)
    .join('');

describe('PlainTextViewer', () => {
  it('marks the passage and scrolls it to the middle of the pane', async () => {
    serveText(DOCUMENT);
    const { container } = wrap(
      <PlainTextViewer contentUrl="/api/files/t1" passage={PASSAGE} />,
    );

    await waitFor(() => expect(container.querySelector('mark')).not.toBeNull());
    const mark = container.querySelector('mark')!;
    expect(mark.textContent).toBe(PASSAGE);
    expect(mark.className).toContain('bg-highlight');
    // Waited for, not read, as in XlsxViewer below: the mark is in the commit,
    // the scroll is an effect that can run in a later task.
    await waitFor(() =>
      expect(scrollSpy).toHaveBeenCalledWith(
        expect.objectContaining({ block: 'center' }),
      ),
    );
    expect(scrollSpy.mock.contexts[0]).toBe(mark);
    expect(screen.queryByTestId('passage-not-found')).toBeNull();
  });

  it('shows the hint, and the whole file, when the passage is not there', async () => {
    serveText(DOCUMENT);
    const { container } = wrap(
      <PlainTextViewer
        contentUrl="/api/files/t1"
        passage="Gwarancja obejmuje wyłącznie wady fabryczne przez 24 miesiące."
      />,
    );

    expect(await screen.findByTestId('passage-not-found')).toHaveTextContent(
      "Couldn't find the exact passage",
    );
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toContain('Reklamacje rozpatruje');
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('marks nothing and hints nothing without a passage', async () => {
    serveText(DOCUMENT);
    const { container } = wrap(<PlainTextViewer contentUrl="/api/files/t1" />);
    await screen.findByText(/Reklamacje rozpatruje/);
    expect(container.querySelector('mark')).toBeNull();
    expect(screen.queryByTestId('passage-not-found')).toBeNull();
  });
});

describe('MarkdownViewer', () => {
  it('marks the passage in the rendered text, across inline formatting', async () => {
    serveText(
      '# Regulamin\n\nZwrot środków następuje na **rachunek wskazany** przez klienta, najpóźniej w terminie 14 dni.',
    );
    const { container } = wrap(
      <MarkdownViewer
        contentUrl="/api/files/m1"
        passage="Zwrot środków następuje na rachunek wskazany przez klienta, najpóźniej w terminie 14 dni."
      />,
    );

    await waitFor(() =>
      expect(container.querySelectorAll('mark').length).toBeGreaterThan(1),
    );
    // One mark per text node the match crosses: before, inside and after the
    // <strong>.
    expect(container.querySelector('strong mark')).not.toBeNull();
    expect(markText(container)).toBe(
      'Zwrot środków następuje na rachunek wskazany przez klienta, najpóźniej w terminie 14 dni.',
    );
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(scrollSpy.mock.contexts[0]).toBe(container.querySelector('mark'));
  });

  it('shows the hint when the passage is not in the document', async () => {
    serveText('# Regulamin\n\nNic tu nie ma o zwrotach środków.');
    wrap(
      <MarkdownViewer
        contentUrl="/api/files/m1"
        passage="Gwarancja obejmuje wyłącznie wady fabryczne przez 24 miesiące."
      />,
    );
    expect(await screen.findByTestId('passage-not-found')).toBeInTheDocument();
  });
});

describe('DocxViewer', () => {
  it('marks the passage in mammoth’s HTML, masked name and all', async () => {
    mammothHtml.value =
      '<h1>Umowa</h1><p>Reklamacje rozpatruje <em>Jan Kowalski</em>, kierownik działu obsługi klienta w Warszawie.</p><p>Inny akapit.</p>';
    serveText('');
    const { container } = wrap(
      <DocxViewer
        contentUrl="/api/files/d1"
        passage="Reklamacje rozpatruje <PERSON>, kierownik działu obsługi klienta w Warszawie."
      />,
    );

    await waitFor(() => expect(container.querySelector('mark')).not.toBeNull());
    expect(markText(container)).toBe(
      'Reklamacje rozpatruje Jan Kowalski, kierownik działu obsługi klienta w Warszawie.',
    );
    expect(container.textContent).toContain('Inny akapit.');
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('passage-not-found')).toBeNull();
  });

  it('shows the hint when the passage is not in the document', async () => {
    mammothHtml.value = '<p>Zupełnie inna treść dokumentu niż cytat.</p>';
    serveText('');
    const { container } = wrap(
      <DocxViewer
        contentUrl="/api/files/d2"
        passage="Gwarancja obejmuje wyłącznie wady fabryczne przez 24 miesiące."
      />,
    );
    expect(await screen.findByTestId('passage-not-found')).toBeInTheDocument();
    expect(container.querySelector('mark')).toBeNull();
  });
});

describe('XlsxViewer', () => {
  const serveWorkbook = (sheets: Record<string, unknown[][]>) => {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    }
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => bytes,
    } as Response);
  };

  it('opens on the sheet the rows came from, marks them, and scrolls past the header', async () => {
    serveWorkbook({
      Summary: [['Total', 100]],
      Policies: [
        ['Policy', 'Days', 'Owner'],
        ['Refund', 14, 'finance'],
        ['Exchange', 30, 'support'],
        ['Warranty', 24, 'legal'],
      ],
    });
    const { container } = wrap(
      <XlsxViewer
        contentUrl="/api/files/x1"
        passage={'Policy,Days,Owner\nExchange,30,support\nWarranty,24,legal'}
      />,
    );

    await screen.findByText('Exchange');
    expect(screen.getByRole('tab', { name: 'Policies' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const cited = Array.from(container.querySelectorAll('tr[data-cited-row]'));
    expect(cited.map((row) => row.textContent)).toEqual([
      '1PolicyDaysOwner',
      '3Exchange30support',
      '4Warranty24legal',
    ]);
    expect(cited[1].querySelector('td')!.className).toContain('bg-highlight');
    // The header matches every chunk; the scroll goes to the first data row.
    //
    // Waited for, not read: the rows are marked in the commit that renders
    // them, but the scroll is a passive effect React may run in a later task.
    // `findByText` resolves on the commit, so under a loaded full run the spy
    // was sometimes still empty here — the rows were right and the scroll had
    // simply not happened yet.
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(scrollSpy.mock.contexts[0]).toBe(cited[1]);
  });

  it('shows the hint when no row matches', async () => {
    serveWorkbook({
      Arkusz1: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    });
    const { container } = wrap(
      <XlsxViewer
        contentUrl="/api/files/x2"
        passage="| Loyalty | 90 | marketing |"
      />,
    );
    expect(await screen.findByTestId('passage-not-found')).toBeInTheDocument();
    expect(container.querySelector('tr[data-cited-row]')).toBeNull();
  });
});

describe('sources with no document to mark', () => {
  it('quotes the passage under a format with no preview', () => {
    wrap(
      <UnsupportedViewer
        fileId="abc"
        fileName="book.epub"
        passage={'## Rozdział 1\n\n**Początek** historii.'}
      />,
    );
    expect(screen.getByText('The passage the answer used')).toBeInTheDocument();
    expect(
      screen.getByText('Rozdział 1 Początek historii.'),
    ).toBeInTheDocument();
  });

  it('shows a scraped page’s passage and links to the page itself', () => {
    wrap(
      <UrlSourceViewer
        url="https://example.com/pricing"
        passage="Plan Pro kosztuje 99 zł miesięcznie."
      />,
    );
    const link = screen.getByRole('link', { name: 'Open the original page' });
    expect(link).toHaveAttribute('href', 'https://example.com/pricing');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      screen.getByText('Plan Pro kosztuje 99 zł miesięcznie.'),
    ).toBeInTheDocument();
  });

  it('reads the URL out of a scraped source’s name, and only http(s)', () => {
    expect(urlFromSourceName('https://example.com/a | scrape')).toBe(
      'https://example.com/a',
    );
    expect(urlFromSourceName('http://example.com | crawl')).toBe(
      'http://example.com/',
    );
    expect(urlFromSourceName('javascript:alert(1) | scrape')).toBeNull();
    expect(urlFromSourceName('report.pdf')).toBeNull();
  });
});
