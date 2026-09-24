import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { useEffect } from 'react';

/**
 * The PDF viewer's first test.
 *
 * `viewers.test.tsx` covers every sibling viewer and has never imported this
 * one, so nobody knew whether it rendered. It does — `pdfjs.GlobalWorkerOptions
 * .workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`
 * resolves under Turbopack, which emits the worker as a static asset and
 * references it from the client chunk. The `pdfjs-dist` alias in next.config.ts
 * that was supposed to make that work pointed at a file that does not exist,
 * inside a `webpack` block Next 16 never calls; it is gone in the same change
 * as this test.
 *
 * react-pdf is mocked: it needs a real PDF, a canvas and a worker, none of
 * which jsdom has. What is under test is this component's own behaviour —
 * paging, zoom, the error state — and, once highlights land, the overlay
 * geometry. The worker wiring is proven by the build, not by jsdom, and the
 * mock is deliberately close to the real API so a react-pdf upgrade that
 * changes the props this component passes shows up here.
 */
const { pageSpy, documentSpy, pageText } = vi.hoisted(() => ({
  pageSpy: vi.fn(),
  documentSpy: vi.fn(),
  /**
   * Each page's text items, as pdf.js reports them. Pages not listed have
   * no text. The mock `Document` also serves these through `getPage`, which
   * is how the page-less citation search reads them.
   */
  pageText: { current: {} as Record<number, string[]> },
}));

vi.mock('react-pdf', () => ({
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
  Document: ({
    children,
    file,
    onLoadSuccess,
    onLoadError,
    loading,
  }: {
    children?: React.ReactNode;
    file: string;
    onLoadSuccess?: (info: {
      numPages: number;
      getPage: (n: number) => Promise<{
        getTextContent: () => Promise<{ items: { str: string }[] }>;
      }>;
    }) => void;
    onLoadError?: (error: Error) => void;
    loading?: React.ReactNode;
  }) => {
    documentSpy({ file });
    const broken = file.includes('broken');
    // Fired once per file, the way the real component loads a document — not
    // on every render. A mock that re-announced the load on each render would
    // reset `pageNumber` behind every click and make paging untestable.
    useEffect(() => {
      if (broken) {
        onLoadError?.(new Error('boom'));
      } else {
        onLoadSuccess?.({
          numPages: 12,
          getPage: async (n: number) => ({
            getTextContent: async () => ({
              items: (pageText.current[n] ?? []).map((str) => ({ str })),
            }),
          }),
        });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file]);
    // `file` doubles as the instruction to the mock: a url containing
    // "broken" fails the load, which is how the error state is reached.
    return broken ? (
      <div>{loading}</div>
    ) : (
      <div data-testid="pdf-document">{children}</div>
    );
  },
  Page: (props: {
    pageNumber: number;
    scale: number;
    onRenderSuccess?: () => void;
    onRenderTextLayerSuccess?: () => void;
    onGetTextSuccess?: (content: { items: { str: string }[] }) => void;
    customTextRenderer?: (item: { str: string; itemIndex: number }) => string;
  }) => {
    pageSpy(props);
    const items = pageText.current[props.pageNumber] ?? [];
    const {
      pageNumber,
      scale,
      onRenderSuccess,
      onRenderTextLayerSuccess,
      onGetTextSuccess,
      customTextRenderer,
    } = props;
    // The order react-pdf keeps: text content is read once per page, the
    // canvas renders on every page or zoom change, and the text layer
    // re-renders when the renderer changes too.
    useEffect(() => {
      onGetTextSuccess?.({ items: items.map((str) => ({ str })) });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageNumber]);
    useEffect(() => {
      onRenderSuccess?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageNumber, scale]);
    useEffect(() => {
      onRenderTextLayerSuccess?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageNumber, scale, customTextRenderer]);
    return (
      <div data-testid="pdf-page">
        page {pageNumber}
        <div data-testid="pdf-text-layer">
          {items.map((str, itemIndex) =>
            customTextRenderer ? (
              <span
                key={itemIndex}
                dangerouslySetInnerHTML={{
                  __html: customTextRenderer({ str, itemIndex }),
                }}
              />
            ) : (
              <span key={itemIndex}>{str}</span>
            ),
          )}
        </div>
      </div>
    );
  },
}));

vi.mock('react-pdf/dist/Page/AnnotationLayer.css', () => ({}));
vi.mock('react-pdf/dist/Page/TextLayer.css', () => ({}));

import { PdfViewer } from '../viewers/PdfViewer';

const messages = {
  'document-preview': {
    loading: 'Ładowanie...',
    'error-loading': 'Nie udało się załadować pliku.',
    page: 'Strona',
    of: 'z',
    'prev-page': 'Poprzednia strona',
    'next-page': 'Następna strona',
    'zoom-in': 'Powiększ',
    'zoom-out': 'Pomniejsz',
    'highlight-legend': 'Podświetlono: akapit, z którego pochodzi ten fragment',
    'passage-not-found': 'Nie udało się odnaleźć dokładnego fragmentu.',
  },
};

const renderViewer = (props: React.ComponentProps<typeof PdfViewer>) =>
  render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <PdfViewer {...props} />
    </NextIntlClientProvider>,
  );

let scrollSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  pageText.current = {};
  scrollSpy = vi.fn();
  Element.prototype.scrollIntoView = scrollSpy as never;
});

afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('PdfViewer', () => {
  it('renders the document it was given and reports its page count', async () => {
    renderViewer({ contentUrl: '/api/files/abc' });

    expect(documentSpy).toHaveBeenCalledWith({ file: '/api/files/abc' });
    await screen.findByTestId('pdf-page');
    expect(screen.getByText(/Strona 1 z 12/)).toBeInTheDocument();
  });

  it('pages forwards and backwards within the document', async () => {
    const user = userEvent.setup();
    renderViewer({ contentUrl: '/api/files/abc' });
    await screen.findByTestId('pdf-page');

    await user.click(screen.getByRole('button', { name: 'Następna strona' }));

    expect(screen.getByText(/Strona 2 z 12/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Poprzednia strona' }));

    expect(screen.getByText(/Strona 1 z 12/)).toBeInTheDocument();
  });

  it('cannot page past either end', async () => {
    const user = userEvent.setup();
    renderViewer({ contentUrl: '/api/files/abc' });
    await screen.findByTestId('pdf-page');

    expect(
      screen.getByRole('button', { name: 'Poprzednia strona' }),
    ).toBeDisabled();

    for (let i = 0; i < 11; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Następna strona' }));
    }

    expect(screen.getByText(/Strona 12 z 12/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Następna strona' }),
    ).toBeDisabled();
  });

  it('zooms the page rather than the container', async () => {
    const user = userEvent.setup();
    renderViewer({ contentUrl: '/api/files/abc' });
    await screen.findByTestId('pdf-page');

    await user.click(screen.getByRole('button', { name: 'Powiększ' }));

    expect(screen.getByText('125%')).toBeInTheDocument();
    // The scale reaches `<Page>`, which is what makes the rendered raster
    // sharp rather than a stretched bitmap — and what an overlay in fractions
    // of the page box needs no arithmetic to follow.
    expect(pageSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ scale: 1.25 }),
    );
  });

  it('draws nothing extra when it is given no highlights', async () => {
    // Every existing caller passes neither prop, and must render exactly as
    // it did before they existed.
    renderViewer({ contentUrl: '/api/files/abc' });
    await screen.findByTestId('pdf-page');

    expect(screen.queryByTestId('pdf-highlights')).not.toBeInTheDocument();
    expect(screen.queryByText(/Podświetlono/)).not.toBeInTheDocument();
  });

  it('shows the error state when the document will not load', async () => {
    renderViewer({ contentUrl: '/api/files/broken' });

    await waitFor(() => {
      expect(
        screen.getByText('Nie udało się załadować pliku.'),
      ).toBeInTheDocument();
    });
  });
});

describe('PdfViewer — highlights', () => {
  const onPageTwo = { page: 2, x: 0.05, y: 0.25, w: 0.9, h: 0.08 };
  const alsoPageTwo = { page: 2, x: 0.05, y: 0.4, w: 0.6, h: 0.04 };
  const onPageFive = { page: 5, x: 0, y: 0, w: 1, h: 0.1 };

  const rects = () =>
    Array.from(screen.getByTestId('pdf-highlights').children) as HTMLElement[];

  it('opens at the page it was asked for', async () => {
    renderViewer({ contentUrl: '/api/files/abc', initialPage: 7 });
    await screen.findByTestId('pdf-page');

    expect(screen.getByText(/Strona 7 z 12/)).toBeInTheDocument();
  });

  it('clamps a page past the end of the document', async () => {
    // `initialPage` comes from a chunk written at ingest; the file behind it
    // can be re-indexed or replaced, and asking react-pdf for page 99 of a
    // 12-page document renders nothing at all.
    renderViewer({ contentUrl: '/api/files/abc', initialPage: 99 });
    await screen.findByTestId('pdf-page');

    expect(screen.getByText(/Strona 12 z 12/)).toBeInTheDocument();
  });

  it('follows a later request to open at a different page', async () => {
    // A reader clicking a second citation while the viewer is open. Ignoring
    // the prop after mount would leave them on the first source's page.
    const { rerender } = renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 3,
    });
    await screen.findByTestId('pdf-page');
    expect(screen.getByText(/Strona 3 z 12/)).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="pl" messages={messages}>
        <PdfViewer contentUrl="/api/files/abc" initialPage={9} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(/Strona 9 z 12/)).toBeInTheDocument();
  });

  it('goes back to the beginning when the next source has no page', async () => {
    // `initialPage: undefined` means "start at the beginning" on an update as
    // much as on mount. Leaving the previous source's page showing would put
    // a citation with no page on page 3 of the one before it.
    const { rerender } = renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 3,
    });
    await screen.findByTestId('pdf-page');
    expect(screen.getByText(/Strona 3 z 12/)).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="pl" messages={messages}>
        <PdfViewer contentUrl="/api/files/abc" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(/Strona 1 z 12/)).toBeInTheDocument();
  });

  it('draws one box per region on the page being shown', async () => {
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 2,
      highlights: [onPageTwo, alsoPageTwo, onPageFive],
    });
    await screen.findByTestId('pdf-page');

    expect(rects()).toHaveLength(2);
  });

  it('places each box at the fraction of the page the worker computed', async () => {
    // Percentages against the page wrapper, so the same numbers are correct at
    // every zoom — no page size and no coordinate origin in the component.
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 2,
      highlights: [onPageTwo],
    });
    await screen.findByTestId('pdf-page');

    expect(rects()[0].style.left).toBe('5%');
    expect(rects()[0].style.top).toBe('25%');
    expect(rects()[0].style.width).toBe('90%');
    expect(rects()[0].style.height).toBe('8%');
  });

  it('keeps the boxes where they are when the page is zoomed', async () => {
    const user = userEvent.setup();
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 2,
      highlights: [onPageTwo],
    });
    await screen.findByTestId('pdf-page');

    await user.click(screen.getByRole('button', { name: 'Powiększ' }));

    expect(pageSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ scale: 1.25 }),
    );
    expect(rects()[0].style.left).toBe('5%');
    expect(rects()[0].style.width).toBe('90%');
  });

  it('draws nothing on a page with no regions', async () => {
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 1,
      highlights: [onPageTwo, onPageFive],
    });
    await screen.findByTestId('pdf-page');

    expect(screen.queryByTestId('pdf-highlights')).not.toBeInTheDocument();
  });

  it('draws nothing for a region on a page the document does not have', async () => {
    renderViewer({
      contentUrl: '/api/files/abc',
      highlights: [{ page: 99, x: 0, y: 0, w: 1, h: 1 }],
    });
    await screen.findByTestId('pdf-page');

    expect(screen.queryByTestId('pdf-highlights')).not.toBeInTheDocument();
  });

  it('follows the reader to another page', async () => {
    const user = userEvent.setup();
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 1,
      highlights: [onPageTwo],
    });
    await screen.findByTestId('pdf-page');
    expect(screen.queryByTestId('pdf-highlights')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Następna strona' }));

    expect(rects()).toHaveLength(1);
  });

  it('says what a box means, and hides the boxes themselves from a reader', async () => {
    // The rectangles are empty divs; announcing eight of them over the page
    // text would be noise. The legend is the accessible statement, and it says
    // "paragraph" because Docling's boxes are per element.
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 2,
      highlights: [onPageTwo],
    });
    await screen.findByTestId('pdf-page');

    expect(
      screen.getByText('Podświetlono: akapit, z którego pochodzi ten fragment'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('pdf-highlights')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});

describe('PdfViewer — jumping to the cited passage', () => {
  const onPageTwo = { page: 2, x: 0.05, y: 0.25, w: 0.9, h: 0.08 };
  const PASSAGE =
    'Klient może zwrócić towar w ciągu 14 dni od dnia doręczenia, bez podawania przyczyny.';

  it('scrolls the first box into view once the page renders', async () => {
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 2,
      highlights: [onPageTwo],
    });
    await screen.findByTestId('pdf-page');

    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(scrollSpy.mock.contexts[0]).toBe(
      screen.getByTestId('pdf-highlights').firstElementChild,
    );
    expect(scrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'center' }),
    );
  });

  it('scrolls to it again after a zoom', async () => {
    const user = userEvent.setup();
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 2,
      highlights: [onPageTwo],
    });
    await screen.findByTestId('pdf-page');
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    const before = scrollSpy.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'Powiększ' }));

    await waitFor(() =>
      expect(scrollSpy.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it('draws the boxes in the highlight colour, not the action colour', async () => {
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 2,
      highlights: [onPageTwo],
    });
    await screen.findByTestId('pdf-page');

    const box = screen.getByTestId('pdf-highlights').firstElementChild!;
    expect(box.className).toContain('bg-highlight');
    expect(box.className).not.toContain('bg-primary');
  });

  it('marks the passage word for word in the text layer, and scrolls to the mark', async () => {
    pageText.current = {
      2: [
        'Regulamin zwrotów ',
        'Klient może zwrócić towar w ciągu 14 dni ',
        'od dnia doręczenia, bez podawania przyczyny.',
        ' Stopka strony',
      ],
    };
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 2,
      highlights: [onPageTwo],
      passage: PASSAGE,
    });

    const layer = await screen.findByTestId('pdf-text-layer');
    await waitFor(() => expect(layer.querySelectorAll('mark')).toHaveLength(2));
    const marks = Array.from(layer.querySelectorAll('mark'));
    expect(marks.map((mark) => mark.textContent).join('')).toBe(
      'Klient może zwrócić towar w ciągu 14 dni od dnia doręczenia, bez podawania przyczyny.',
    );
    // The mark, not the box: it is the more precise of the two.
    await waitFor(() => expect(scrollSpy.mock.contexts.at(-1)).toBe(marks[0]));
    expect(screen.queryByTestId('passage-not-found')).not.toBeInTheDocument();
  });

  it('escapes the page text it renders around a mark', async () => {
    pageText.current = {
      1: ['<img src=x onerror=alert(1)> ' + PASSAGE],
    };
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 1,
      passage: PASSAGE,
    });

    const layer = await screen.findByTestId('pdf-text-layer');
    await waitFor(() => expect(layer.querySelector('mark')).not.toBeNull());
    expect(layer.querySelector('img')).toBeNull();
    expect(layer.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('keeps the boxes and says nothing when the text layer has no match', async () => {
    pageText.current = { 2: ['Zupełnie inny tekst na tej stronie dokumentu.'] };
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 2,
      highlights: [onPageTwo],
      passage: PASSAGE,
    });
    await screen.findByTestId('pdf-page');

    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(screen.getByTestId('pdf-highlights')).toBeInTheDocument();
    expect(screen.queryByTestId('passage-not-found')).not.toBeInTheDocument();
  });

  it('says so when neither a box nor the text marks anything', async () => {
    pageText.current = { 2: ['Zupełnie inny tekst na tej stronie dokumentu.'] };
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 2,
      passage: PASSAGE,
    });

    expect(await screen.findByTestId('passage-not-found')).toBeInTheDocument();
  });

  it('finds the page from the passage when the citation has none', async () => {
    // A thread reopened from before pages were stored: a snippet, no page.
    pageText.current = {
      1: ['Spis treści'],
      2: ['Wstęp do regulaminu sklepu internetowego.'],
      3: [PASSAGE],
    };
    renderViewer({ contentUrl: '/api/files/abc', passage: PASSAGE });

    expect(await screen.findByText(/Strona 3 z 12/)).toBeInTheDocument();
    const layer = screen.getByTestId('pdf-text-layer');
    await waitFor(() => expect(layer.querySelector('mark')).not.toBeNull());
  });

  it('does not search for a page when the citation already names one', async () => {
    pageText.current = { 3: [PASSAGE] };
    renderViewer({
      contentUrl: '/api/files/abc',
      initialPage: 5,
      passage: PASSAGE,
    });

    await screen.findByTestId('pdf-page');
    // Give a stray search the chance to land before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText(/Strona 5 z 12/)).toBeInTheDocument();
  });
});
