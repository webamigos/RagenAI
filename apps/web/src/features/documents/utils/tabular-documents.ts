/**
 * Which documents "Optymalizuj dla RAG" and "Oceń dla RAG" are not for (spec
 * 2026-09-26-rag-readiness-score-review, Q4 and D2).
 *
 * The score's rubric and Optimize's suggestions — restructure, pronoun
 * context, question headings — are prose edits. On a spreadsheet the right
 * action is to re-parse it, not to rewrite it, and Phase A measured the score
 * at its least meaningful there. So both are refused for these types in the
 * command, and the panel offers neither.
 *
 * One list, read by the command, the route and the menus, because the gap
 * this replaces was three: the Optimize route and the Optimize tab each kept
 * their own, and the score command kept none.
 *
 * By stored `fileType`. D2's second half, a document whose indexed chunks
 * are mostly table chunks, needs `metadata.diagnostics` (Phase C) and is
 * added where that is read.
 */
export const TABULAR_FILE_TYPES: ReadonlySet<string> = new Set(['XLSX', 'CSV']);

/**
 * Optimize is not for tabular documents, and not for an image either: its
 * text is a model's description of the picture, not something the owner
 * wrote and could edit.
 */
export const OPTIMIZE_UNSUPPORTED_FILE_TYPES: ReadonlySet<string> = new Set([
  ...TABULAR_FILE_TYPES,
  'IMAGE',
]);

export function isTabularFileType(fileType: string | null | undefined) {
  return !!fileType && TABULAR_FILE_TYPES.has(fileType);
}

export function canOptimizeFileType(fileType: string | null | undefined) {
  return !fileType || !OPTIMIZE_UNSUPPORTED_FILE_TYPES.has(fileType);
}
