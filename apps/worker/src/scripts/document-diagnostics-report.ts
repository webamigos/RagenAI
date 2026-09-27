import {
  DIAGNOSTIC_CHECKS,
  type DiagnosticCheck,
  type DocumentDiagnostics,
} from '@ragenai/rag-core/document-diagnostics';

/**
 * The pure half of `document-diagnostics-corpora.ts` (spec
 * 2026-09-26-rag-readiness-score-review, C4): what one file in one parse shape
 * produced, what the spec says each shape must produce, and the report.
 *
 * Separate from the script so the expectations — the part C4 is judged on —
 * are tested without Docling, a corpus or a file system.
 */

export type ShapeRow = {
  corpus: string;
  shape: string;
  file: string;
  /**
   * Why ingest would refuse this text as a whole (`findUndecodableText`), or
   * `null` when it would index it. The raw-XML shape is refused at ingest
   * today; its chunks are what the markup check exists for.
   */
  ingestRefuses: string | null;
  diagnostics: DocumentDiagnostics;
};

/**
 * What the spec requires of a shape: a check that must fire on every file,
 * or must fire on none. A shape not listed carries no expectation — its
 * findings are reported, not judged.
 */
export type Expectation = {
  shape: string;
  check: DiagnosticCheck;
  on: 'every-file' | 'no-file';
  why: string;
};

export const EXPECTATIONS: Expectation[] = [
  {
    shape: 'raw-xml',
    check: 'markup',
    on: 'every-file',
    why: 'C4: the raw-XML shape must raise "Parsed as markup"',
  },
  {
    shape: 'partial-markup',
    check: 'markup',
    on: 'every-file',
    why: 'a document ingest accepts, with one part of it XML',
  },
  {
    shape: 'docling-table-chunks',
    check: 'table-without-header',
    on: 'no-file',
    why: 'C4: nothing about headers when Docling flagged them',
  },
  {
    shape: 'docling',
    check: 'fallback-parser',
    on: 'no-file',
    why: 'Docling parsed it, so there is no fallback to report',
  },
  {
    shape: 'legacy',
    check: 'fallback-parser',
    on: 'no-file',
    why: 'a deployment that chose the legacy parser has not fallen back',
  },
];

export type ExpectationResult = Expectation & {
  files: number;
  firing: number;
  pass: boolean;
};

const fires = (row: ShapeRow, check: DiagnosticCheck) =>
  row.diagnostics.findings.some((finding) => finding.check === check);

export function judge(rows: readonly ShapeRow[]): ExpectationResult[] {
  return EXPECTATIONS.flatMap((expectation) => {
    const inShape = rows.filter((row) => row.shape === expectation.shape);
    if (inShape.length === 0) {
      return [];
    }
    const firing = inShape.filter((row) =>
      fires(row, expectation.check),
    ).length;
    const pass =
      expectation.on === 'every-file'
        ? firing === inShape.length
        : firing === 0;
    return [{ ...expectation, files: inShape.length, firing, pass }];
  });
}

const cell = (row: ShapeRow, check: DiagnosticCheck): string => {
  const finding = row.diagnostics.findings.find((f) => f.check === check);
  if (!finding) {
    return '·';
  }
  const chunks = finding.detail?.chunks;
  const share = finding.detail?.share;
  const mark = finding.severity === 'warn' ? 'W' : 'i';
  if (typeof chunks === 'number') {
    return `${mark} ${chunks}`;
  }
  if (typeof share === 'number') {
    return `${mark} ${share}`;
  }
  return mark;
};

/** Checks that fired anywhere, in the panel's order — the report's columns. */
function firedChecks(rows: readonly ShapeRow[]): DiagnosticCheck[] {
  return DIAGNOSTIC_CHECKS.filter((check) =>
    rows.some((row) => fires(row, check)),
  );
}

export function renderReport(
  rows: readonly ShapeRow[],
  context: { date: string; commit: string },
): string {
  const results = judge(rows);
  const columns = firedChecks(rows);
  const lines: string[] = [];

  lines.push(
    `# Document diagnostics on the Phase A corpora — ${context.date}`,
    '',
    `Commit \`${context.commit}\`. Spec 2026-09-26-rag-readiness-score-review, C4.`,
    'Produced by `apps/worker/src/scripts/document-diagnostics-corpora.ts`:',
    "the worker's own loaders and `splitText` on each file, then",
    '`computeDocumentDiagnostics`. No model call, no embedding, no database.',
    '',
    '## Expectations',
    '',
    '| Shape | Check | Must fire on | Files | Firing | Result | Why |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const r of results) {
    lines.push(
      `| ${r.shape} | \`${r.check}\` | ${r.on === 'every-file' ? 'every file' : 'no file'} | ${r.files} | ${r.firing} | ${r.pass ? 'pass' : '**FAIL**'} | ${r.why} |`,
    );
  }

  lines.push(
    '',
    '## By file',
    '',
    '`W n` is a warning on n chunks, `i` information, `·` nothing. Ingest',
    'column: why ingest refuses the whole text, if it does.',
    '',
    `| Corpus | Shape | File | Ingest | Chunks | Tables | ${columns.map((c) => `\`${c}\``).join(' | ')} |`,
    `| --- | --- | --- | --- | --- | --- | ${columns.map(() => '---').join(' | ')} |`,
  );
  for (const row of rows) {
    const { chunkCount, tableChunkCount } = row.diagnostics.stats;
    lines.push(
      `| ${row.corpus} | ${row.shape} | ${row.file} | ${row.ingestRefuses ?? 'indexes'} | ${chunkCount} | ${tableChunkCount} | ${columns.map((c) => cell(row, c)).join(' | ')} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
