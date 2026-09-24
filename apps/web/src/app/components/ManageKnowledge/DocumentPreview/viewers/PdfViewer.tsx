'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useTranslations } from 'next-intl';
import type { SourceRegion } from '@ragenai/rag-core';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
} from '@heroicons/react/24/outline';

import {
  findPassagePage,
  passageRangesInItems,
  renderMarkedItem,
  type ItemRanges,
  type PdfTextSource,
} from '../passage/pdf-passage';
import { scrollPassageIntoView } from '../passage/highlight-in-element';
import { PassageNotFoundHint } from '../passage/PassageNotFoundHint';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type Props = {
  contentUrl: string;
  /**
   * The page to open at, 1-based. Clamped once the real page count is known,
   * because it comes from a chunk's metadata and a document can be re-indexed
   * or replaced between the two.
   *
   * Absent means "start at the beginning", which is every existing caller.
   */
  initialPage?: number;
  /**
   * Rectangles to draw over the page, as top-left-origin fractions of the page
   * box — the shape the worker normalised at ingest.
   *
   * These mark **paragraphs**, not sentences: Docling's boxes are per element,
   * and the first one in a typical document spans the full column width. The
   * legend says so rather than implying a precision the parser cannot deliver.
   *
   * Only the ones on the page being shown are drawn. Absent or empty renders
   * exactly as before, which is what every existing caller gets.
   */
  highlights?: SourceRegion[];
  /**
   * The passage a citation quoted. Marked word for word in the page's text
   * layer where it can be found there, which is more precise than a
   * paragraph box and works for a PDF the parser gave no boxes for. With no
   * `initialPage`, it is also how the viewer finds the page to open at.
   */
  passage?: string;
};

/**
 * The passage as found in one page's text layer. `ranges` is `null` when the
 * page was searched and the passage is not on it.
 */
type TextMatch = { page: number; ranges: ItemRanges | null };

/** Keeps a requested page inside a document that may have been re-indexed. */
const clampPage = (page: number, numPages: number) =>
  numPages > 0 ? Math.min(Math.max(page, 1), numPages) : Math.max(page, 1);

export function PdfViewer({
  contentUrl,
  initialPage,
  highlights,
  passage,
}: Props) {
  const t = useTranslations('document-preview');
  const [numPages, setNumPages] = useState<number>(0);
  /**
   * What was asked for, not what is shown.
   *
   * The page actually rendered is this clamped to the page count, derived
   * below rather than stored. Storing the clamped value needs the count at the
   * moment of every write, and the count arrives asynchronously — so a request
   * that landed first would be clamped against `0` and stick. Deriving it
   * means the clamp re-runs for free the moment the real count exists.
   */
  const [requestedPage, setRequestedPage] = useState(initialPage ?? 1);
  const [scale, setScale] = useState(1.0);
  const [error, setError] = useState(false);

  const [textMatch, setTextMatch] = useState<TextMatch | null>(null);
  /** The rendered page, which is what a scroll to the passage looks inside. */
  const pageRef = useRef<HTMLDivElement>(null);
  /**
   * Set once the reader turns a page themselves, so a page search still
   * running for a page-less citation does not yank them back.
   */
  const readerMovedRef = useRef(false);

  const pageNumber = clampPage(requestedPage, numPages);

  const turnTo = (page: number) => {
    readerMovedRef.current = true;
    setRequestedPage(page);
  };

  const onDocumentLoadSuccess = useCallback(
    (pdf: { numPages: number } & Partial<PdfTextSource>) => {
      setNumPages(pdf.numPages);
      setRequestedPage(initialPage ?? 1);
      setScale(1.0);
      readerMovedRef.current = false;
      if (initialPage !== undefined || !passage || !pdf.getPage) {
        return;
      }
      // No page on the citation — a thread from before pages were stored, a
      // document no box was parsed for. The quote finds the page instead.
      findPassagePage(
        pdf as PdfTextSource,
        passage,
        () => readerMovedRef.current,
      )
        .then((found) => {
          if (found !== null && !readerMovedRef.current) {
            setRequestedPage(found);
          }
        })
        .catch(() => {
          // A page that cannot be read is a page not searched; the document
          // is still open at its first page, which is where it would be.
        });
    },
    [initialPage, passage],
  );

  /**
   * Brings the cited passage into view: the word-level mark when the text
   * layer has one, else the first paragraph box.
   *
   * Called after the canvas renders and after the text layer does, so it
   * runs again on every zoom — a zoom re-renders both, and the passage the
   * reader was looking at should not drift off screen because the page grew.
   */
  const scrollToCitation = useCallback(() => {
    const page = pageRef.current;
    if (!page) {
      return;
    }
    scrollPassageIntoView(
      page.querySelector('mark[data-cited-passage]') ??
        page.querySelector('[data-cited-region]'),
    );
  }, []);

  const onGetTextSuccess = useCallback(
    ({ items }: { items: readonly object[] }) => {
      if (!passage) {
        return;
      }
      setTextMatch({
        page: pageNumber,
        ranges: passageRangesInItems(items, passage),
      });
    },
    [passage, pageNumber],
  );

  const currentRanges =
    passage && textMatch?.page === pageNumber ? textMatch.ranges : null;

  /**
   * Stable while the ranges are, because react-pdf re-renders the whole
   * text layer whenever this function changes identity.
   */
  const customTextRenderer = useCallback(
    ({ str, itemIndex }: { str: string; itemIndex: number }) =>
      renderMarkedItem(str, currentRanges?.get(itemIndex)),
    [currentRanges],
  );

  // A different source was activated while the viewer stayed open. Following
  // the prop rather than ignoring it is the whole point of opening at a page:
  // the second citation a reader clicks must move the view.
  //
  // `undefined` means the beginning, on an update as much as on mount — that
  // is what the prop documents. Ignoring it here would leave the previous
  // source's page showing for a citation that has no page. Today the two
  // sources are always different files, so the reload resets it anyway; that
  // is a property of the dedupe in `operations.ts`, not of this component.
  useEffect(() => {
    setRequestedPage(initialPage ?? 1);
  }, [initialPage]);

  const pageHighlights = (highlights ?? []).filter(
    (region) => region.page === pageNumber,
  );

  // Only once this page's text has been searched, and only when neither the
  // text nor a box marks anything: a paragraph box is a found passage too.
  const passageMissing =
    Boolean(passage) &&
    textMatch?.page === pageNumber &&
    textMatch.ranges === null &&
    pageHighlights.length === 0;

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-destructive">
        {t('error-loading')}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => turnTo(Math.max(1, pageNumber - 1))}
            disabled={pageNumber <= 1}
            aria-label={t('prev-page')}
            className="rounded p-1 hover:bg-paper-200 disabled:opacity-40 dark:hover:bg-paper-700"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            {t('page')} {pageNumber} {t('of')} {numPages}
          </span>
          <button
            onClick={() => turnTo(Math.min(numPages, pageNumber + 1))}
            disabled={pageNumber >= numPages}
            aria-label={t('next-page')}
            className="rounded p-1 hover:bg-paper-200 disabled:opacity-40 dark:hover:bg-paper-700"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
        {pageHighlights.length > 0 ? (
          // Says what a rectangle means, and says "paragraph" on purpose:
          // Docling's boxes are per element, so promising the sentence would
          // be promising something the parser never produced.
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {t('highlight-legend')}
          </span>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
            aria-label={t('zoom-out')}
            className="rounded p-1 hover:bg-paper-200 dark:hover:bg-paper-700"
          >
            <MagnifyingGlassMinusIcon className="size-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(3, s + 0.25))}
            aria-label={t('zoom-in')}
            className="rounded p-1 hover:bg-paper-200 dark:hover:bg-paper-700"
          >
            <MagnifyingGlassPlusIcon className="size-4" />
          </button>
        </div>
      </div>

      {passageMissing ? <PassageNotFoundHint /> : null}

      <div className="flex-1 overflow-auto bg-muted dark:bg-card">
        <div className="flex justify-center p-4">
          <Document
            file={contentUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={() => setError(true)}
            loading={
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                {t('loading')}
              </div>
            }
          >
            {/*
              The overlay is positioned against this wrapper, which is exactly
              the size of the rendered page. Percentages then need no
              arithmetic: the worker already converted every box to a fraction
              of the page box, so a rectangle lands correctly at any `scale`
              without the component knowing the page size or the parser's
              coordinate origin.
            */}
            <div ref={pageRef} className="relative inline-block shadow-lg">
              <Page
                pageNumber={pageNumber}
                scale={scale}
                onRenderSuccess={scrollToCitation}
                onRenderTextLayerSuccess={scrollToCitation}
                onGetTextSuccess={passage ? onGetTextSuccess : undefined}
                customTextRenderer={
                  currentRanges ? customTextRenderer : undefined
                }
              />
              {pageHighlights.length > 0 ? (
                <div
                  // Decorative: the legend above carries the meaning, and a
                  // screen reader reading out eight empty boxes would be
                  // noise over the page text it already has.
                  aria-hidden="true"
                  data-testid="pdf-highlights"
                  className="pointer-events-none absolute inset-0"
                >
                  {pageHighlights.map((region, index) => (
                    <div
                      key={`${region.page}-${region.x}-${region.y}-${index}`}
                      data-cited-region=""
                      // Multiplied, like a highlighter on paper: the page
                      // under it stays legible instead of being tinted over.
                      className="absolute rounded-xs bg-highlight/50 ring-1 ring-highlight mix-blend-multiply"
                      style={{
                        left: `${region.x * 100}%`,
                        top: `${region.y * 100}%`,
                        width: `${region.w * 100}%`,
                        height: `${region.h * 100}%`,
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </Document>
        </div>
      </div>
    </div>
  );
}
