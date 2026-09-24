import {
  findFoldedPassage,
  findPassage,
  foldSnippet,
  foldText,
} from './find-passage';

/**
 * The classes on a passage marked in a PDF's text layer.
 *
 * Not `PASSAGE_MARK_CLASS`: pdf.js draws the glyphs on a canvas and lays
 * transparent text over them for selection, so the mark must keep that text
 * transparent and let the canvas show through. `mix-blend-multiply` is what a
 * highlighter does on paper — the ink stays black under the yellow.
 */
export const PDF_PASSAGE_MARK_CLASS =
  'rounded-xs bg-highlight/60 text-transparent mix-blend-multiply';

/** The part of pdf.js's text content this module reads. */
type TextContentItem = { str?: unknown } | object;

/** For each text item the passage touches: the character range inside it. */
export type ItemRanges = Map<number, readonly [number, number]>;

function isTextItem(item: TextContentItem): item is { str: string } {
  return 'str' in item && typeof item.str === 'string';
}

/**
 * Finds the passage in one page's text items, and says which characters of
 * which items it covers — the shape `customTextRenderer` is called in.
 *
 * Indices are positions in `items`, marked-content entries included, because
 * that is the `itemIndex` react-pdf hands the renderer.
 */
export function passageRangesInItems(
  items: readonly TextContentItem[],
  passage: string,
): ItemRanges | null {
  const starts: Array<{ index: number; start: number; length: number }> = [];
  let text = '';
  items.forEach((item, index) => {
    if (!isTextItem(item) || item.str.length === 0) {
      return;
    }
    starts.push({ index, start: text.length, length: item.str.length });
    text += item.str;
  });

  const match = findPassage(text, passage);
  if (!match) {
    return null;
  }

  const ranges: ItemRanges = new Map();
  for (const { index, start, length } of starts) {
    const end = start + length;
    if (end <= match.start || start >= match.end) {
      continue;
    }
    ranges.set(index, [
      Math.max(match.start, start) - start,
      Math.min(match.end, end) - start,
    ]);
  }
  return ranges.size > 0 ? ranges : null;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);

/**
 * One text item as the HTML `customTextRenderer` returns, with its share of
 * the passage wrapped in a `<mark>`.
 *
 * The item's text is the document's, so it is escaped: react-pdf sanitises
 * what a renderer returns, but a PDF is untrusted input and the renderer
 * should not be relying on someone else's sanitiser to be safe.
 */
export function renderMarkedItem(
  str: string,
  range: readonly [number, number] | undefined,
): string {
  if (!range) {
    return escapeHtml(str);
  }
  const [from, to] = range;
  return (
    escapeHtml(str.slice(0, from)) +
    `<mark class="${PDF_PASSAGE_MARK_CLASS}" data-cited-passage="">` +
    escapeHtml(str.slice(from, to)) +
    '</mark>' +
    escapeHtml(str.slice(to))
  );
}

/** The part of a pdf.js document this module reads. */
export type PdfTextSource = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getTextContent: () => Promise<{ items: readonly TextContentItem[] }>;
  }>;
};

/**
 * Pages searched for a passage when the citation carries no page. A long
 * report is read front to back in well under a second; a 2,000-page scan
 * would be minutes of text extraction for a convenience.
 */
export const PASSAGE_PAGE_SEARCH_LIMIT = 300;

/**
 * The page a passage is on, for a citation that does not say.
 *
 * A thread reopened from before the page was stored, and every document a
 * non-Docling loader ingested, arrive with a snippet and no page. The text
 * is enough to find it. Pages are read in order and the first match wins;
 * `isCancelled` is checked between pages so closing the panel stops the
 * search rather than leaving it running against a destroyed document.
 */
export async function findPassagePage(
  pdf: PdfTextSource,
  passage: string,
  isCancelled: () => boolean = () => false,
): Promise<number | null> {
  const foldedPassage = foldSnippet(passage);
  const last = Math.min(pdf.numPages, PASSAGE_PAGE_SEARCH_LIMIT);
  for (let pageNumber = 1; pageNumber <= last; pageNumber++) {
    if (isCancelled()) {
      return null;
    }
    const page = await pdf.getPage(pageNumber);
    const { items } = await page.getTextContent();
    const text = items
      .map((item) => (isTextItem(item) ? item.str : ''))
      .join('');
    if (findFoldedPassage(foldText(text), foldedPassage)) {
      return pageNumber;
    }
  }
  return null;
}
