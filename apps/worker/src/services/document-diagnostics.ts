import { findUndecodableText } from '@ragenai/rag-core/undecodable-text';

import type { Document } from '../types/Document.js';
import { FileType } from '../types/UserFile.js';
import { DOCLING_SUPPORTED_TYPES } from '../utils/docling.js';
import { CHUNK_SETTINGS } from '../utils/splitters.js';

/**
 * What the index actually holds for one document, checked without a model.
 *
 * The RAG readiness score grades the source text against a prose rubric and
 * has never tracked retrieval (spec 2026-09-26-rag-readiness-score-review,
 * Phase A). These checks read the chunks retrieval indexes instead, and each
 * one names a mechanism that has been shown to matter — a table whose rows
 * lost their column names (ADR-43), a parse that fell back, a chunk that holds
 * nothing — so a finding is something a person can act on, not a grade.
 *
 * Pure and deterministic: the same chunks give the same findings. It runs on
 * every ingest (Phase C2) whatever the `documentDiagnostics` key says, which is
 * why it must never throw on a shape it did not expect — the caller treats it
 * as best-effort anyway, but a check that does not apply returns nothing.
 *
 * Every threshold below is a starting value. C4 calibrates them on the Phase A
 * corpora; they are named so that calibration is a diff of constants.
 */

export const DIAGNOSTICS_VERSION = 1;

export type DiagnosticCheck =
  | 'markup'
  | 'table-without-header'
  | 'over-budget'
  | 'few-section-paths'
  | 'overlap-duplication'
  | 'empty-chunks'
  | 'fallback-parser';

export type DiagnosticFinding = {
  /** Stable, and the i18n key the panel renders it under (C3). */
  check: DiagnosticCheck;
  /** `warn` is what the list's badge shows; `info` appears only in detail. */
  severity: 'info' | 'warn';
  detail?: Record<string, number | string>;
};

export type DiagnosticStats = {
  chunkCount: number;
  tableChunkCount: number;
  medianChunkChars: number;
  /**
   * Share of prose chunks carrying a `sectionPath`, or `null` where the parse
   * path produces none — Docling's prose chunks never do, so a 0 there would
   * be a fact about the splitter, not the document.
   */
  sectionPathShare: number | null;
  /** Characters repeated from the previous chunk, over all prose characters. */
  overlapShare: number;
};

export type DocumentDiagnostics = {
  version: typeof DIAGNOSTICS_VERSION;
  computedAt: string;
  findings: DiagnosticFinding[];
  stats: DiagnosticStats;
};

export type DiagnosticsParse = {
  /**
   * How the text reached the splitter. `version-text` is a re-index of a
   * document version's stored text, which has no parser at all. `unknown` is
   * a backfill from stored chunks, which do not record their parser: the
   * checks that depend on it — the fallback and the section-path share —
   * then say nothing rather than guess.
   */
  parser: 'docling' | 'legacy' | 'version-text' | 'unknown';
  /** Whether the deployment asked for Docling on a type it supports. */
  doclingExpected: boolean;
};

/** A chunk this far over its type's budget is a chunk the splitter could not cut. */
export const OVER_BUDGET_FACTOR = 1.5;
/** Share of chunks over budget at which the finding becomes a warning. */
export const OVER_BUDGET_WARN_SHARE = 0.2;
/** Below this share of prose chunks with a section path, context rendering has little to show. */
export const MIN_SECTION_PATH_SHARE = 0.5;
/** A document this short says nothing about its headings either way. */
export const MIN_PROSE_CHUNKS_FOR_SECTIONS = 3;
/** Past the configured overlap and then some: the same text indexed twice. */
export const MAX_OVERLAP_SHARE = 0.4;
/** Letters and digits a chunk needs, once placeholders are removed, to hold anything. */
export const MIN_CONTENT_CHARS = 3;
/** Share of a CSV header row's cells that are numbers, at or above which it is data. */
export const NUMERIC_HEADER_SHARE = 0.5;

/** Docling's image stand-in and the table stand-ins `table-chunks.ts` writes. */
const PLACEHOLDERS = [/<!--\s*image\s*-->/gi, /\[Table \d+(?::[^\]\n]*)?\]/g];

/** The line `renderPipes` writes under a header, and only under one. */
const ALIGNMENT_ROW = /^\|(?:\s*:?-+:?\s*\|)+\s*$/m;

const TABULAR_FILE_TYPES = new Set<FileType>([FileType.CSV, FileType.XLSX]);

/** The legacy splitters that emit `sectionPath` on prose (ADR-17, ADR-18). */
const SECTION_PATH_TYPES = new Set<FileType>([FileType.DOCX, FileType.PDF]);

/** Every type a person uploads text in; `UNKNOWN` never reaches a splitter. */
const TEXT_TYPES = new Set<FileType>(
  Object.values(FileType).filter((type) => type !== FileType.UNKNOWN),
);

type Context = {
  chunks: Document[];
  prose: Document[];
  tables: Document[];
  fileType: FileType;
  parse: DiagnosticsParse;
  budget: number;
};

type Check = {
  check: DiagnosticCheck;
  /** An unknown type gets no findings, never a warning. */
  appliesTo: ReadonlySet<FileType>;
  run: (context: Context) => DiagnosticFinding | null;
};

function isTable(chunk: Document): boolean {
  return chunk.metadata?.chunk_type === 'table';
}

function isSummary(chunk: Document): boolean {
  return chunk.metadata?.chunk_type === 'summary';
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function contentChars(text: string): number {
  let rest = text;
  for (const placeholder of PLACEHOLDERS) {
    rest = rest.replace(placeholder, ' ');
  }
  return (rest.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

/**
 * How much of `next` repeats the end of `previous`. The recursive splitter
 * starts a chunk with a suffix of the one before, so the repeat is a prefix
 * of `next`; a probe of its opening characters finds the candidates.
 *
 * Searched from the end, so the shortest such suffix wins. In real text there
 * is one; in text that repeats itself — a boilerplate line, a fixture — every
 * earlier occurrence is also a match, and taking the longest would count most
 * of the chunk as overlap.
 */
function repeatedPrefixLength(previous: string, next: string): number {
  const probe = next.slice(0, Math.min(32, next.length));
  if (probe.length === 0) {
    return 0;
  }
  let from = previous.lastIndexOf(probe);
  while (from !== -1) {
    const suffix = previous.slice(from);
    if (next.startsWith(suffix)) {
      return suffix.length;
    }
    from = from === 0 ? -1 : previous.lastIndexOf(probe, from - 1);
  }
  return 0;
}

function overlapShare(prose: Document[]): number {
  const total = prose.reduce((sum, c) => sum + c.pageContent.length, 0);
  if (total === 0) {
    return 0;
  }
  let repeated = 0;
  for (let i = 1; i < prose.length; i++) {
    repeated += repeatedPrefixLength(
      prose[i - 1].pageContent,
      prose[i].pageContent,
    );
  }
  return repeated / total;
}

function sectionPathShare(context: Context): number | null {
  if (
    !SECTION_PATH_TYPES.has(context.fileType) ||
    context.parse.parser !== 'legacy' ||
    context.prose.length === 0
  ) {
    return null;
  }
  const withPath = context.prose.filter(
    (chunk) => typeof chunk.metadata?.sectionPath === 'string',
  ).length;
  return withPath / context.prose.length;
}

/** The first line of a CSV chunk is the row `packRows` repeats as its header. */
function csvHeaderLooksLikeData(chunk: Document): boolean {
  const header = chunk.pageContent.split('\n', 1)[0] ?? '';
  const cells = header.split(',').map((cell) => cell.trim());
  const filled = cells.filter((cell) => cell.length > 0);
  if (filled.length === 0) {
    return true;
  }
  const numeric = filled.filter((cell) =>
    /^[-+]?[\d\s.,%]+$/.test(cell),
  ).length;
  return numeric / filled.length >= NUMERIC_HEADER_SHARE;
}

const CHECKS: Check[] = [
  {
    // The whole document is refused at ingest when it is markup; this is the
    // part of a document that is — an OOXML part or an HTML block that
    // survived a parse, quoted back by the chat as a source.
    check: 'markup',
    appliesTo: TEXT_TYPES,
    run: ({ chunks }) => {
      const count = chunks.filter(
        (chunk) => findUndecodableText(chunk.pageContent) === 'markup',
      ).length;
      return count > 0
        ? { check: 'markup', severity: 'warn', detail: { chunks: count } }
        : null;
    },
  },
  {
    // ADR-43: a table chunk earns its retrieval gain by repeating the column
    // names. Docling's table chunks carry an alignment row only when Docling
    // flagged header cells; a CSV always repeats its first row, so the
    // question there is whether that row is a header at all.
    check: 'table-without-header',
    appliesTo: TEXT_TYPES,
    run: ({ chunks, tables, fileType }) => {
      if (TABULAR_FILE_TYPES.has(fileType) && tables.length === 0) {
        const rows = chunks.filter((chunk) => !isTable(chunk));
        const headerless = rows.filter(csvHeaderLooksLikeData).length;
        return headerless > 0
          ? {
              check: 'table-without-header',
              severity: 'warn',
              detail: { chunks: headerless, source: 'csv' },
            }
          : null;
      }
      const headerless = tables.filter(
        (chunk) => !ALIGNMENT_ROW.test(chunk.pageContent),
      ).length;
      return headerless > 0
        ? {
            check: 'table-without-header',
            severity: 'warn',
            detail: { chunks: headerless, source: 'docling' },
          }
        : null;
    },
  },
  {
    // A table row wider than the budget is emitted whole on purpose — by
    // `buildTableChunks` and by the CSV row-group splitter alike — so only
    // prose is measured, and not at all in a spreadsheet.
    check: 'over-budget',
    appliesTo: new Set(
      [...TEXT_TYPES].filter((type) => !TABULAR_FILE_TYPES.has(type)),
    ),
    run: ({ prose, budget }) => {
      if (budget <= 0 || prose.length === 0) {
        return null;
      }
      const over = prose.filter(
        (chunk) => chunk.pageContent.length > budget * OVER_BUDGET_FACTOR,
      ).length;
      if (over === 0) {
        return null;
      }
      return {
        check: 'over-budget',
        severity:
          over / prose.length >= OVER_BUDGET_WARN_SHARE ? 'warn' : 'info',
        detail: { chunks: over, budget },
      };
    },
  },
  {
    check: 'few-section-paths',
    appliesTo: SECTION_PATH_TYPES,
    run: (context) => {
      const share = sectionPathShare(context);
      if (
        share === null ||
        context.prose.length < MIN_PROSE_CHUNKS_FOR_SECTIONS ||
        share >= MIN_SECTION_PATH_SHARE
      ) {
        return null;
      }
      return {
        check: 'few-section-paths',
        severity: 'warn',
        detail: { share: Number(share.toFixed(2)) },
      };
    },
  },
  {
    // Informational only: whether overlap duplicated in the stored content is
    // a problem is an open product decision (spec, B2).
    check: 'overlap-duplication',
    appliesTo: TEXT_TYPES,
    run: ({ prose }) => {
      const share = overlapShare(prose);
      return share > MAX_OVERLAP_SHARE
        ? {
            check: 'overlap-duplication',
            severity: 'info',
            detail: { share: Number(share.toFixed(2)) },
          }
        : null;
    },
  },
  {
    check: 'empty-chunks',
    appliesTo: TEXT_TYPES,
    run: ({ chunks }) => {
      const empty = chunks.filter(
        (chunk) => contentChars(chunk.pageContent) < MIN_CONTENT_CHARS,
      ).length;
      return empty > 0
        ? { check: 'empty-chunks', severity: 'warn', detail: { chunks: empty } }
        : null;
    },
  },
  {
    // The deployment asked for Docling and got the legacy loader: no table
    // chunks, no page anchors, and for PDFs a parse by an external model.
    check: 'fallback-parser',
    appliesTo: DOCLING_SUPPORTED_TYPES,
    run: ({ parse }) =>
      parse.doclingExpected && parse.parser === 'legacy'
        ? { check: 'fallback-parser', severity: 'warn' }
        : null,
  },
];

/**
 * The findings and stats for one document's chunks, as the splitter produced
 * them (camelCase metadata, before `prepareMetadata`). A summary chunk, if one
 * is passed, is the model's text rather than the document's and is ignored.
 */
export function computeDocumentDiagnostics(
  chunks: Document[],
  fileType: FileType,
  parse: DiagnosticsParse,
  now: Date = new Date(),
): DocumentDiagnostics {
  const indexed = chunks.filter((chunk) => !isSummary(chunk));
  const tables = indexed.filter(isTable);
  const prose = indexed.filter((chunk) => !isTable(chunk));
  const context: Context = {
    chunks: indexed,
    prose,
    tables,
    fileType,
    parse,
    budget: CHUNK_SETTINGS[fileType]?.chunkSize ?? 0,
  };

  const findings = CHECKS.filter((check) => check.appliesTo.has(fileType))
    .map((check) => check.run(context))
    .filter((finding): finding is DiagnosticFinding => finding !== null);

  return {
    version: DIAGNOSTICS_VERSION,
    computedAt: now.toISOString(),
    findings,
    stats: {
      chunkCount: indexed.length,
      tableChunkCount: tables.length,
      medianChunkChars: median(indexed.map((c) => c.pageContent.length)),
      sectionPathShare: sectionPathShare(context),
      overlapShare: Number(overlapShare(prose).toFixed(3)),
    },
  };
}
