import { describe, expect, it } from 'vitest';

import type { DoclingTable } from '../docling-client.js';
import {
  computeDocumentDiagnostics,
  type DiagnosticCheck,
  type DiagnosticsParse,
  type DocumentDiagnostics,
} from '../document-diagnostics.js';
import { splitCsvDocuments } from '../text-splitters/csv-row-group-splitter.js';
import { splitMarkdownDocuments } from '../text-splitters/markdown-text-splitter.js';
import { buildTableChunks } from '../text-splitters/table-chunks.js';
import type { Document } from '../../types/Document.js';
import { FileType } from '../../types/UserFile.js';

/**
 * Fixtures come from the real splitters wherever one exists, so a check is
 * exercised on the shape the parse path actually produces — a hand-written
 * "table chunk" would test the check against the author's idea of one.
 */

const DOCLING: DiagnosticsParse = { parser: 'docling', doclingExpected: true };
const FALLBACK: DiagnosticsParse = { parser: 'legacy', doclingExpected: true };
const LEGACY: DiagnosticsParse = { parser: 'legacy', doclingExpected: false };

const NOW = new Date('2026-09-27T12:00:00.000Z');

const checks = (d: DocumentDiagnostics): DiagnosticCheck[] =>
  d.findings.map((f) => f.check);

const finding = (d: DocumentDiagnostics, check: DiagnosticCheck) =>
  d.findings.find((f) => f.check === check);

const prose = (text: string, metadata: Record<string, unknown> = {}) => ({
  pageContent: text,
  metadata,
});

const PARAGRAPH =
  'Passengers who cancel a ticket before departure are refunded sixty two ' +
  'percent of the fare, less a handling charge that the operator publishes ' +
  'each season. ';

/** Distinct sentences, so no chunk boundary can match text elsewhere. */
const sentences = (count: number) =>
  Array.from(
    { length: count },
    (_, i) =>
      `Clause ${i + 1} sets the refund for route ${i * 7 + 3} at ${40 + i} percent of the fare.`,
  ).join(' ');

/** Docling's markdown for a short report, split as ingest splits it. */
const doclingProse = (): Document[] =>
  splitMarkdownDocuments(
    [
      prose(
        `# Refund policy\n\n${PARAGRAPH.repeat(4)}\n\n## Exceptions\n\n${PARAGRAPH.repeat(3)}`,
      ),
    ],
    { chunkSize: 800, chunkOverlap: 200, keepSeparator: true },
  );

const cell = (text: string, row: number, col: number, header: boolean) => ({
  text,
  columnHeader: header,
  rowSpan: 1,
  colSpan: 1,
  startRow: row,
  startCol: col,
});

const doclingTable = (grid: string[][], headerRows: number): DoclingTable => ({
  selfRef: '#/tables/0',
  numRows: grid.length,
  numCols: grid[0].length,
  cells: grid.flatMap((row, r) =>
    row.map((text, c) => cell(text, r, c, r < headerRows)),
  ),
});

const FARES = [
  ['Zone', 'Adult', 'Child'],
  ['A', '4.20', '2.10'],
  ['B', '5.80', '2.90'],
];

describe('computeDocumentDiagnostics', () => {
  describe('a clean Docling parse', () => {
    it('finds nothing to warn about, and says what it counted', () => {
      const tables = buildTableChunks(doclingTable(FARES, 1), 0, {
        budget: 1000,
      });
      const result = computeDocumentDiagnostics(
        [...doclingProse(), ...tables],
        FileType.PDF,
        DOCLING,
        NOW,
      );

      expect(result.findings.filter((f) => f.severity === 'warn')).toEqual([]);
      expect(result).toMatchObject({
        version: 1,
        computedAt: '2026-09-27T12:00:00.000Z',
        stats: { tableChunkCount: 1 },
      });
      expect(result.stats.chunkCount).toBeGreaterThan(1);
      expect(result.stats.medianChunkChars).toBeGreaterThan(0);
    });

    it('reports no section-path share, because Docling prose carries none', () => {
      const result = computeDocumentDiagnostics(
        doclingProse(),
        FileType.DOCX,
        DOCLING,
        NOW,
      );
      expect(result.stats.sectionPathShare).toBeNull();
      expect(checks(result)).not.toContain('few-section-paths');
    });
  });

  describe('markup', () => {
    const WORKSHEET =
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c>' +
      '<c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>12</v></c>' +
      '<c r="B2"><v>7</v></c></row><row r="3"><c r="A3"><v>9</v></c></row>' +
      '</sheetData></worksheet>';

    it('warns on a chunk that is an OOXML part rather than text', () => {
      const result = computeDocumentDiagnostics(
        [...doclingProse(), prose(WORKSHEET)],
        FileType.DOCX,
        DOCLING,
        NOW,
      );
      expect(finding(result, 'markup')).toEqual({
        check: 'markup',
        severity: 'warn',
        detail: { chunks: 1 },
      });
    });

    it('does not warn on a markdown table with <br> in its cells', () => {
      const result = computeDocumentDiagnostics(
        [prose('| Step | Note |\n| --- | --- |\n| 1 | first<br>then second |')],
        FileType.MARKDOWN,
        DOCLING,
        NOW,
      );
      expect(checks(result)).not.toContain('markup');
    });
  });

  describe('table-without-header', () => {
    it('warns on a Docling table chunk with no flagged header row', () => {
      const tables = buildTableChunks(doclingTable(FARES, 0), 0, {
        budget: 1000,
      });
      const result = computeDocumentDiagnostics(
        [...doclingProse(), ...tables],
        FileType.PDF,
        DOCLING,
        NOW,
      );
      expect(finding(result, 'table-without-header')).toEqual({
        check: 'table-without-header',
        severity: 'warn',
        detail: { chunks: 1, source: 'docling' },
      });
    });

    it('says nothing about headers when Docling flagged them (C4)', () => {
      const tables = buildTableChunks(doclingTable(FARES, 1), 0, {
        budget: 1000,
      });
      const result = computeDocumentDiagnostics(
        tables,
        FileType.XLSX,
        DOCLING,
        NOW,
      );
      expect(checks(result)).not.toContain('table-without-header');
    });

    it('warns on a CSV whose first row is data, repeated as a header', () => {
      const rows = Array.from(
        { length: 60 },
        (_, i) => `${i},${i * 3},${i * 7}`,
      );
      const chunks = splitCsvDocuments([prose(rows.join('\n'))], {
        chunkSize: 200,
      });
      const result = computeDocumentDiagnostics(
        chunks,
        FileType.CSV,
        LEGACY,
        NOW,
      );
      expect(finding(result, 'table-without-header')).toMatchObject({
        severity: 'warn',
        detail: { chunks: chunks.length, source: 'csv' },
      });
    });

    it('accepts a CSV with a header row', () => {
      const rows = ['zone,adult,child'].concat(
        Array.from({ length: 60 }, (_, i) => `${i},4.20,2.10`),
      );
      const chunks = splitCsvDocuments([prose(rows.join('\n'))], {
        chunkSize: 200,
      });
      const result = computeDocumentDiagnostics(
        chunks,
        FileType.CSV,
        LEGACY,
        NOW,
      );
      expect(checks(result)).not.toContain('table-without-header');
    });
  });

  describe('over-budget', () => {
    const long = prose('x '.repeat(900));

    it('is information for an occasional long chunk', () => {
      const result = computeDocumentDiagnostics(
        [...Array.from({ length: 6 }, () => prose(PARAGRAPH)), long],
        FileType.MARKDOWN,
        DOCLING,
        NOW,
      );
      expect(finding(result, 'over-budget')).toEqual({
        check: 'over-budget',
        severity: 'info',
        detail: { chunks: 1, budget: 800 },
      });
    });

    it('is a warning when a large share of chunks is over', () => {
      const result = computeDocumentDiagnostics(
        [long, long, prose(PARAGRAPH)],
        FileType.MARKDOWN,
        DOCLING,
        NOW,
      );
      expect(finding(result, 'over-budget')?.severity).toBe('warn');
    });

    it('ignores a table row emitted whole, and spreadsheets altogether', () => {
      const wide = [['Header'], ['y'.repeat(3000)]];
      const tables = buildTableChunks(doclingTable(wide, 1), 0, {
        budget: 800,
      });
      expect(
        checks(computeDocumentDiagnostics(tables, FileType.PDF, DOCLING, NOW)),
      ).not.toContain('over-budget');
      expect(
        checks(
          computeDocumentDiagnostics([long, long], FileType.CSV, LEGACY, NOW),
        ),
      ).not.toContain('over-budget');
    });
  });

  describe('few-section-paths', () => {
    const sections = (withPath: number, without: number) => [
      ...Array.from({ length: withPath }, () =>
        prose(PARAGRAPH, { sectionPath: 'Refunds > Exceptions' }),
      ),
      ...Array.from({ length: without }, () => prose(PARAGRAPH)),
    ];

    it('warns when a legacy DOCX parse lost most of its headings', () => {
      const result = computeDocumentDiagnostics(
        sections(1, 4),
        FileType.DOCX,
        LEGACY,
        NOW,
      );
      expect(finding(result, 'few-section-paths')).toEqual({
        check: 'few-section-paths',
        severity: 'warn',
        detail: { share: 0.2 },
      });
      expect(result.stats.sectionPathShare).toBe(0.2);
    });

    it('is quiet when most chunks carry one, or the document is too short to say', () => {
      expect(
        checks(
          computeDocumentDiagnostics(sections(4, 1), FileType.PDF, LEGACY, NOW),
        ),
      ).not.toContain('few-section-paths');
      expect(
        checks(
          computeDocumentDiagnostics(sections(0, 2), FileType.PDF, LEGACY, NOW),
        ),
      ).not.toContain('few-section-paths');
    });

    it('does not apply to a type whose splitter never writes one', () => {
      const result = computeDocumentDiagnostics(
        sections(0, 6),
        FileType.TEXT,
        LEGACY,
        NOW,
      );
      expect(checks(result)).not.toContain('few-section-paths');
      expect(result.stats.sectionPathShare).toBeNull();
    });
  });

  describe('overlap-duplication', () => {
    it('measures the configured overlap without flagging it', () => {
      const result = computeDocumentDiagnostics(
        splitMarkdownDocuments([prose(sentences(60))], {
          chunkSize: 800,
          chunkOverlap: 200,
        }),
        FileType.MARKDOWN,
        DOCLING,
        NOW,
      );
      expect(result.stats.overlapShare).toBeGreaterThan(0.1);
      expect(checks(result)).not.toContain('overlap-duplication');
    });

    it('measures nothing when the splitter was asked for no overlap', () => {
      const result = computeDocumentDiagnostics(
        splitMarkdownDocuments([prose(sentences(60))], {
          chunkSize: 800,
          chunkOverlap: 0,
        }),
        FileType.MARKDOWN,
        DOCLING,
        NOW,
      );
      expect(result.stats.chunkCount).toBeGreaterThan(3);
      expect(result.stats.overlapShare).toBe(0);
    });

    it('is information, never a warning, when most text repeats', () => {
      const text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa';
      const result = computeDocumentDiagnostics(
        [prose(text), prose(text.slice(6)), prose(text.slice(11))],
        FileType.TEXT,
        LEGACY,
        NOW,
      );
      expect(finding(result, 'overlap-duplication')?.severity).toBe('info');
    });
  });

  describe('empty-chunks', () => {
    it('warns on chunks that hold only a placeholder or whitespace', () => {
      const result = computeDocumentDiagnostics(
        [
          ...doclingProse(),
          prose('<!-- image -->'),
          prose('[Table 3: Fares by zone]\n'),
          prose('   \n\n'),
        ],
        FileType.PDF,
        DOCLING,
        NOW,
      );
      expect(finding(result, 'empty-chunks')).toEqual({
        check: 'empty-chunks',
        severity: 'warn',
        detail: { chunks: 3 },
      });
    });

    it('keeps a short chunk that says something', () => {
      const result = computeDocumentDiagnostics(
        [prose('Fare: 4.20')],
        FileType.TEXT,
        LEGACY,
        NOW,
      );
      expect(checks(result)).not.toContain('empty-chunks');
    });
  });

  describe('fallback-parser', () => {
    it('warns when Docling was asked for and the legacy loader parsed it', () => {
      const result = computeDocumentDiagnostics(
        doclingProse(),
        FileType.PDF,
        FALLBACK,
        NOW,
      );
      expect(finding(result, 'fallback-parser')).toEqual({
        check: 'fallback-parser',
        severity: 'warn',
      });
    });

    it('is quiet on a deployment that chose the legacy parser, and on SRT', () => {
      expect(
        checks(
          computeDocumentDiagnostics(doclingProse(), FileType.PDF, LEGACY, NOW),
        ),
      ).not.toContain('fallback-parser');
      expect(
        checks(
          computeDocumentDiagnostics(
            doclingProse(),
            FileType.SRT,
            FALLBACK,
            NOW,
          ),
        ),
      ).not.toContain('fallback-parser');
    });

    it('does not apply to a re-index of version text', () => {
      const result = computeDocumentDiagnostics(
        doclingProse(),
        FileType.PDF,
        { parser: 'version-text', doclingExpected: true },
        NOW,
      );
      expect(checks(result)).not.toContain('fallback-parser');
    });
  });

  // A backfill from stored chunks does not know how they were parsed.
  describe('an unknown parser', () => {
    const UNKNOWN: DiagnosticsParse = {
      parser: 'unknown',
      doclingExpected: true,
    };

    it('reports no fallback and no section-path share', () => {
      const result = computeDocumentDiagnostics(
        [
          prose(PARAGRAPH),
          prose(PARAGRAPH),
          prose(PARAGRAPH),
          prose(PARAGRAPH),
        ],
        FileType.DOCX,
        UNKNOWN,
        NOW,
      );
      expect(checks(result)).not.toContain('fallback-parser');
      expect(checks(result)).not.toContain('few-section-paths');
      expect(result.stats.sectionPathShare).toBeNull();
    });

    it('still runs the checks that read only the chunks', () => {
      const result = computeDocumentDiagnostics(
        [...doclingProse(), prose('<!-- image -->')],
        FileType.PDF,
        UNKNOWN,
        NOW,
      );
      expect(checks(result)).toContain('empty-chunks');
    });
  });

  describe('what it does not judge', () => {
    it('gives an unknown type no findings, even on chunks that would warn', () => {
      const result = computeDocumentDiagnostics(
        [prose('<!-- image -->'), prose('')],
        FileType.UNKNOWN,
        FALLBACK,
        NOW,
      );
      expect(result.findings).toEqual([]);
    });

    it('ignores the summary chunk, which is the model’s text', () => {
      const result = computeDocumentDiagnostics(
        [prose('', { chunk_type: 'summary' }), ...doclingProse()],
        FileType.PDF,
        DOCLING,
        NOW,
      );
      expect(checks(result)).not.toContain('empty-chunks');
      expect(result.stats.chunkCount).toBe(doclingProse().length);
    });

    it('returns an empty report for no chunks, without throwing', () => {
      const result = computeDocumentDiagnostics([], FileType.PDF, DOCLING, NOW);
      expect(result.findings).toEqual([]);
      expect(result.stats).toEqual({
        chunkCount: 0,
        tableChunkCount: 0,
        medianChunkChars: 0,
        sectionPathShare: null,
        overlapShare: 0,
      });
    });

    it('is deterministic', () => {
      const chunks = doclingProse();
      expect(
        computeDocumentDiagnostics(chunks, FileType.PDF, DOCLING, NOW),
      ).toEqual(computeDocumentDiagnostics(chunks, FileType.PDF, DOCLING, NOW));
    });
  });
});
