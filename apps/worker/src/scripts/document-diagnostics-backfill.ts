import type {
  DiagnosticCheck,
  DocumentDiagnostics,
} from '../services/document-diagnostics.js';
import type { Document } from '../types/Document.js';

/**
 * The pure half of `backfill-document-diagnostics.ts` (spec
 * 2026-09-26-rag-readiness-score-review, Data model and D4): turning the
 * points a file has in Qdrant back into the chunks the checks read, and
 * summarising what a backfill found, per file type — the table D4 sets
 * against C4's corpora before the default flips.
 */

/** A point as the worker writes it (`services/qdrant.ts`). */
export type StoredPoint = {
  payload?: Record<string, unknown> | null;
};

/**
 * The chunks retrieval holds for one file, in the order they were cut.
 *
 * Order matters: the overlap check compares each chunk with the one before
 * it. The summary chunk (ADR-16) is the model's text, not the document's,
 * and is left out, as ingest's call leaves it out. Metadata goes back to the
 * splitter's camelCase (`sectionPath`), which is what the checks read.
 */
export function chunksFromPoints(points: readonly StoredPoint[]): Document[] {
  return points
    .map((point) => {
      const payload = point.payload ?? {};
      const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
      const text = payload.pageContent ?? payload.content;
      return {
        index:
          typeof metadata.chunk_index === 'number'
            ? metadata.chunk_index
            : Number.MAX_SAFE_INTEGER,
        chunk: {
          pageContent: typeof text === 'string' ? text : '',
          metadata: {
            ...(metadata.chunk_type === 'table' ||
            metadata.chunk_type === 'summary'
              ? { chunk_type: metadata.chunk_type }
              : {}),
            ...(typeof metadata.section_path === 'string'
              ? { sectionPath: metadata.section_path }
              : {}),
          },
        },
      };
    })
    .filter(({ chunk }) => chunk.metadata.chunk_type !== 'summary')
    .sort((a, b) => a.index - b.index)
    .map(({ chunk }) => chunk);
}

export type BackfillRow = {
  fileId: string;
  fileType: string;
  diagnostics: DocumentDiagnostics;
};

export type TypeSummary = {
  fileType: string;
  files: number;
  /** Files with at least one warning — the ones the list would badge. */
  badged: number;
  /** Files with each check, warning or information. */
  byCheck: Partial<Record<DiagnosticCheck, number>>;
};

export function summariseByType(rows: readonly BackfillRow[]): TypeSummary[] {
  const byType = new Map<string, TypeSummary>();
  for (const row of rows) {
    const summary = byType.get(row.fileType) ?? {
      fileType: row.fileType,
      files: 0,
      badged: 0,
      byCheck: {},
    };
    summary.files += 1;
    if (row.diagnostics.findings.some((f) => f.severity === 'warn')) {
      summary.badged += 1;
    }
    for (const finding of row.diagnostics.findings) {
      summary.byCheck[finding.check] =
        (summary.byCheck[finding.check] ?? 0) + 1;
    }
    byType.set(row.fileType, summary);
  }
  return [...byType.values()].sort((a, b) =>
    a.fileType.localeCompare(b.fileType),
  );
}

export function renderSummary(summaries: readonly TypeSummary[]): string {
  // Columns in the order the checks first appear, so this file does not keep
  // a second copy of the check list to drift from the one that runs them.
  const checks = [
    ...new Set(
      summaries.flatMap((s) => Object.keys(s.byCheck) as DiagnosticCheck[]),
    ),
  ];
  // No check column at all when nothing fired, rather than an empty one.
  const row = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
  const lines = [
    row(['Type', 'Files', 'Badged', ...checks.map((c) => `\`${c}\``)]),
    row(['---', '---', '---', ...checks.map(() => '---')]),
    ...summaries.map((s) =>
      row([
        s.fileType,
        s.files,
        s.badged,
        ...checks.map((c) => s.byCheck[c] ?? 0),
      ]),
    ),
  ];
  return lines.join('\n');
}
