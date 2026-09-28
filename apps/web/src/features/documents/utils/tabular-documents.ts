import { readDocumentDiagnostics } from '@ragenai/rag-core/document-diagnostics';

/**
 * Which documents "Optymalizuj dla RAG" is not for (spec
 * 2026-09-26-rag-readiness-score-review, Q4 and D2).
 *
 * Optimize's suggestions — restructure, pronoun context, question headings —
 * are prose edits, and the score it measures them against grades prose;
 * Phase A measured it at its least meaningful on tables. On a spreadsheet the
 * right action is to re-parse it, not to rewrite it. So Optimize is refused
 * for these documents at the route, and the panel does not offer it.
 *
 * One definition, read by the route, the menus and the tab, because the gap
 * this replaced was three copies of a type list that had already drifted.
 */
export const TABULAR_FILE_TYPES: ReadonlySet<string> = new Set(['XLSX', 'CSV']);

/**
 * A document whose indexed chunks are more than this share table chunks is
 * tabular whatever its file type — a PDF price list, a DOCX that is one long
 * schedule (D2). "Mostly" is taken literally: more than half.
 *
 * Measured against the Phase A corpora (C4): the table documents with table
 * chunks on sit at 0.83–0.86, the prose corpus at 0. Nothing sits near the
 * line, so its exact value is not doing the work.
 */
export const MOSTLY_TABLE_SHARE = 0.5;

type DocumentLike = {
  fileType?: string | null;
  /** `UserFile.metadata`, or anything carrying its `diagnostics` key. */
  metadata?: unknown;
};

/**
 * Whether the indexed chunks are mostly tables, by `metadata.diagnostics`
 * (C2). False when there are no diagnostics — a file indexed before they
 * existed, or one whose checks failed: "not computed" is not evidence of a
 * table, and the file type still answers for spreadsheets.
 *
 * It counts `chunk_type: 'table'` chunks, which exist only where Docling
 * parsed the file with table chunks on (`FEATURE_FLAG_TABLE_CHUNKS`). Without
 * them a table rides inside prose chunks and a PDF price list is not seen
 * as tabular here.
 */
export function isMostlyTableChunks(metadata: unknown): boolean {
  const diagnostics = readDocumentDiagnostics(metadata);
  if (!diagnostics || diagnostics.stats.chunkCount === 0) {
    return false;
  }
  const { tableChunkCount, chunkCount } = diagnostics.stats;
  return tableChunkCount / chunkCount > MOSTLY_TABLE_SHARE;
}

export function isTabularDocument({ fileType, metadata }: DocumentLike) {
  return (
    (!!fileType && TABULAR_FILE_TYPES.has(fileType)) ||
    isMostlyTableChunks(metadata)
  );
}

/**
 * Optimize is not for a tabular document, and not for an image either: an
 * image's text is a model's description of the picture, not something the
 * owner wrote and could edit. A document written in the panel has no file,
 * and is prose.
 */
export function canOptimizeDocument(document: DocumentLike) {
  return document.fileType !== 'IMAGE' && !isTabularDocument(document);
}
