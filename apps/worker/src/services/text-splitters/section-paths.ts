import { type Document } from '../../types/Document.js';
import { locate } from './source-pages.js';

/**
 * Gives Markdown prose chunks the heading path they sit under, as
 * `sectionPath` — "Umowa > 4. Wynagrodzenie > 4.2 Terminy".
 *
 * Docling's output is Markdown, and every Docling-parsed document was cut by
 * the Markdown splitter, which splits at headings but records none of them. So
 * a Docling chunk carried no `section_path`: ADR-19's `section` attribute in
 * the rendered context was empty for most documents, and a chunk under
 * "4.2 Terminy" did not say so. The DOCX and legacy PDF splitters track the
 * heading stack as they go; this recovers the same thing for Markdown after
 * the split, by position (spec 2026-09-29-contextual-chunks, A1).
 *
 * A chunk's path is the heading stack in force where the chunk starts in the
 * source, so a chunk that opens on a heading is filed under that heading.
 * Chunks are located the way `attachSourcePages` locates them, and one that
 * cannot be located gets no path rather than a guessed one. A chunk that
 * already has a path — a table chunk, or anything a loader labelled — keeps
 * its own.
 */
export function attachSectionPaths(
  chunks: Document[],
  markdown: string,
): Document[] {
  const headings = headingsOf(markdown);
  if (headings.length === 0) {
    return chunks;
  }

  let searchFrom = 0;
  return chunks.map((chunk) => {
    if (typeof chunk.metadata?.sectionPath === 'string') {
      return chunk;
    }
    const text = chunk.pageContent.trim();
    if (text.length === 0) {
      return chunk;
    }
    const offset = locate(markdown, text, searchFrom);
    if (offset === -1) {
      return chunk;
    }
    searchFrom = offset + 1;

    const sectionPath = pathAt(offset, headings);
    if (!sectionPath) {
      return chunk;
    }
    return { ...chunk, metadata: { ...chunk.metadata, sectionPath } };
  });
}

export type MarkdownHeading = { offset: number; level: number; text: string };

const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCE = /^[ \t]*(```|~~~)/;

/** ATX headings (`#` to `######`) with their offsets, outside code fences. */
export function headingsOf(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  let offset = 0;
  let inFence = false;

  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      const match = HEADING.exec(line);
      const text = match?.[2]?.trim();
      if (match && text) {
        headings.push({ offset, level: match[1]!.length, text });
      }
    }
    offset += line.length + 1;
  }
  return headings;
}

/** The path of the headings at or before `offset`, deepest last. */
function pathAt(
  offset: number,
  headings: readonly MarkdownHeading[],
): string | undefined {
  // stack[i] is the most recent heading of level i + 1; a heading clears
  // every deeper level, as a new chapter ends the previous one's sections.
  const stack: (string | undefined)[] = [];
  for (const heading of headings) {
    if (heading.offset > offset) {
      break;
    }
    stack[heading.level - 1] = heading.text;
    stack.length = heading.level;
  }
  const path = stack.filter((h): h is string => Boolean(h));
  return path.length > 0 ? path.join(' > ') : undefined;
}
