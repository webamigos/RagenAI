import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import messages from '@/app/messages/en.json';

/**
 * The panel behind a citation.
 *
 * The viewer itself is mocked: it is loaded with `next/dynamic` precisely so
 * pdf.js stays out of the chat bundle until a reader opens a source, and pulling
 * it into jsdom would defeat both the point and the test — pdf.js reaches for
 * `DOMMatrix` at module scope. What is asserted here is the wiring: which file
 * is opened, at which page, with which rectangles, and how the panel closes.
 */
const viewerSpy = vi.hoisted(() => vi.fn());

vi.mock('next/dynamic', () => ({
  default: () => (props: Record<string, unknown>) => {
    viewerSpy(props);
    return <div data-testid="viewer" />;
  },
}));

import { CitedSourcePreview } from '../CitedSourcePreview';
import type { RetrievalSource } from '@/store/assistant/assistantSlice';

const show = (source: RetrievalSource | null, onClose = vi.fn()) => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CitedSourcePreview source={source} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
};

const source = (overrides: Partial<RetrievalSource> = {}): RetrievalSource => ({
  fileId: 'file-a',
  fileName: 'umowa.pdf',
  chunkCount: 1,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CitedSourcePreview', () => {
  it('renders nothing until a source is picked', () => {
    show(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(viewerSpy).not.toHaveBeenCalled();
  });

  it('opens the file the citation points at, through the guarded route', () => {
    // `/api/files/{id}` already checks tenancy and authorization as two
    // separate conditions. This panel adds no read path of its own, which is
    // why it can show a document it knows nothing about beyond an id.
    show(source());

    expect(viewerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-a',
        contentUrl: '/api/files/file-a',
      }),
    );
  });

  it('opens at the page the quoted chunk came from', () => {
    show(source({ sourcePage: 7 }));

    expect(viewerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ initialPage: 7 }),
    );
  });

  it('highlights the regions of the chunk the answer read', () => {
    const regions = [{ page: 7, x: 0.05, y: 0.2, w: 0.9, h: 0.06 }];
    show(source({ sourcePage: 7, sourceRegions: regions }));

    expect(viewerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ highlights: regions }),
    );
  });

  it('opens at the beginning when the parser knew no page', () => {
    // Every legacy loader and every unpaginated format. Defaulting to 1 here
    // would be indistinguishable from a real page 1, which is the whole reason
    // `sourcePage` is absent rather than zero upstream.
    show(source());

    expect(viewerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ initialPage: undefined }),
    );
  });

  it.each([0, 1.5, -3, Number.POSITIVE_INFINITY])(
    'refuses %s as a page rather than passing it to the viewer',
    (page) => {
      // The value arrived over the network. A component should not place a
      // view using a number it cannot justify because something upstream
      // promised not to send one — the same check the source card makes.
      show(source({ sourcePage: page }));

      expect(viewerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ initialPage: undefined }),
      );
    },
  );

  it('picks the viewer from the file name, since a chunk carries no type', () => {
    show(source({ fileName: 'notatki.md' }));

    expect(viewerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ fileType: 'MARKDOWN' }),
    );
  });

  it('falls back to the id when the file name was never stored', () => {
    show(source({ fileName: null }));

    expect(screen.getByRole('dialog')).toHaveAccessibleName('file-a');
    expect(viewerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ fileType: 'UNKNOWN', fileName: 'file-a' }),
    );
  });

  it('names the panel after the document', () => {
    show(source());

    expect(screen.getByRole('dialog')).toHaveAccessibleName('umowa.pdf');
  });

  it('closes on the close button', async () => {
    const onClose = show(source());

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the overlay', async () => {
    const onClose = show(source());

    await userEvent.click(screen.getByTestId('cited-source-overlay'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const onClose = show(source());

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not listen for Escape while it is closed', async () => {
    // The panel is mounted under every answer in the thread. A listener per
    // closed panel would mean one Escape firing `onClose` for every turn on
    // screen.
    const onClose = show(null);

    await userEvent.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });
});
