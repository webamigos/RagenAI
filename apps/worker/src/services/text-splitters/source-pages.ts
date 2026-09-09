import { type Document } from '../../types/Document';

export type PageAnchor = { offset: number; page: number };

/**
 * Gives each chunk the page it came from.
 *
 * Docling reports a page per element and the markdown it produces is one flat
 * string, so the page has to be recovered by position: a chunk starting at
 * offset X belongs to the page of the last anchor at or before X.
 *
 * **Chunks are located by searching, not by arithmetic.** The splitter returns
 * text without offsets, and reconstructing them by summing lengths does not
 * work — chunks overlap, and separators are consumed at boundaries. Searching
 * for the chunk's own opening text is exact where it succeeds and simply
 * declines to answer where it does not.
 *
 * The search walks forward from the *previous chunk's start*, not its end.
 * Consecutive chunks overlap by `chunkOverlap`, so the next one begins before
 * the last one finished; starting from the end would skip past it and match
 * some later repetition of the same sentence instead.
 *
 * A chunk that cannot be located gets no page. That is the whole point of the
 * exercise: gap 3 exists because a number was shown under the word "page"
 * without being one, and a guessed page repeats the mistake in a form that is
 * harder to spot.
 */
export function attachSourcePages(
  chunks: Document[],
  markdown: string,
  anchors: readonly PageAnchor[],
): Document[] {
  if (anchors.length === 0 || markdown.length === 0) {
    return chunks;
  }

  let searchFrom = 0;

  return chunks.map((chunk) => {
    const needle = chunk.pageContent.trim().slice(0, PROBE_LENGTH);
    if (needle.length === 0) {
      return chunk;
    }

    const offset = markdown.indexOf(needle, searchFrom);
    if (offset === -1) {
      return chunk;
    }
    // The next chunk starts at or after this one's start, never before.
    searchFrom = offset;

    const page = pageAt(offset, anchors);
    if (page === null) {
      return chunk;
    }

    return {
      ...chunk,
      metadata: { ...chunk.metadata, sourcePage: page },
    };
  });
}

/**
 * A prefix long enough to be unique in practice and short enough to survive
 * the whitespace the splitter trims at chunk boundaries. Matching the whole
 * chunk fails on any trimmed character; matching a few words matches the
 * wrong paragraph.
 */
const PROBE_LENGTH = 60;

function pageAt(offset: number, anchors: readonly PageAnchor[]): number | null {
  let page: number | null = null;
  for (const anchor of anchors) {
    if (anchor.offset > offset) {
      break;
    }
    page = anchor.page;
  }
  return page;
}
