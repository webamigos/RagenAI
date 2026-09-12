import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
const { pageSpy, documentSpy } = vi.hoisted(() => ({
  pageSpy: vi.fn(),
  documentSpy: vi.fn(),
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
    onLoadSuccess?: (info: { numPages: number }) => void;
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
        onLoadSuccess?.({ numPages: 12 });
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
  Page: (props: { pageNumber: number; scale: number }) => {
    pageSpy(props);
    return <div data-testid="pdf-page">page {props.pageNumber}</div>;
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
  },
};

const renderViewer = (props: React.ComponentProps<typeof PdfViewer>) =>
  render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <PdfViewer {...props} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
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

  it('shows the error state when the document will not load', async () => {
    renderViewer({ contentUrl: '/api/files/broken' });

    await waitFor(() => {
      expect(
        screen.getByText('Nie udało się załadować pliku.'),
      ).toBeInTheDocument();
    });
  });
});
