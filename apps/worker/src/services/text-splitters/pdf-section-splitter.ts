import { type Document } from '../../types/Document';
import { splitDocuments } from './recursive-character-text-splitter';

/**
 * PDF section splitter (ADR-18, Phase 4b).
 *
 * Consumes Document[] produced by the Claude structured-output PDF
 * extraction path (see src/services/chains/pdf-process-rag/chain.ts).
 * Each input document represents one section with `metadata.sectionPath`
 * already set from the heading stack. This splitter's job is just to
 * enforce the chunk budget: sections that fit are passed through
 * unchanged; sections that don't are recursively split while preserving
 * `sectionPath` on every sub-chunk so retrieval always knows which
 * heading a piece of content came from.
 *
 * Mirrors the DOCX heading splitter's oversized-paragraph handling
 * (see docx-heading-splitter.ts) — same pattern applied to section
 * bodies instead of individual paragraphs.
 *
 * For documents without `sectionPath` (the legacy flat-text fallback
 * path in chain.ts), the splitter is also safe: it just runs the
 * recursive character splitter as the default would have.
 */

export type PdfSectionSplitterOptions = {
  chunkSize: number;
  chunkOverlap: number;
};

function splitPdfSection(
  doc: Document,
  options: PdfSectionSplitterOptions,
): Document[] {
  const content = doc.pageContent;

  // Fast path: section fits the budget — emit unchanged.
  if (content.length <= options.chunkSize) {
    return [doc];
  }

  // Oversized section: recursively split the body, preserving all
  // metadata (including sectionPath) on each sub-chunk.
  return splitDocuments([doc], {
    chunkSize: options.chunkSize,
    chunkOverlap: options.chunkOverlap,
    keepSeparator: true,
  });
}

export function splitPdfDocuments(
  docs: Document[],
  options: PdfSectionSplitterOptions,
): Document[] {
  return docs.flatMap((doc) => splitPdfSection(doc, options));
}
