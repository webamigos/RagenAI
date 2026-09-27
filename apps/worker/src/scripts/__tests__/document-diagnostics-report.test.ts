import type {
  DiagnosticFinding,
  DocumentDiagnostics,
} from '@ragenai/rag-core/document-diagnostics';
import { describe, expect, it } from 'vitest';

import {
  judge,
  missingShapes,
  renderReport,
  type ShapeRow,
} from '../document-diagnostics-report.js';

const report = (findings: DiagnosticFinding[]): DocumentDiagnostics => ({
  version: 1,
  computedAt: '2026-09-27T12:00:00.000Z',
  findings,
  stats: {
    chunkCount: 10,
    tableChunkCount: 2,
    medianChunkChars: 700,
    sectionPathShare: null,
    overlapShare: 0.2,
  },
});

const row = (
  shape: string,
  file: string,
  findings: DiagnosticFinding[] = [],
): ShapeRow => ({
  corpus: 'tabele',
  shape,
  file,
  ingestRefuses: null,
  diagnostics: report(findings),
});

const MARKUP: DiagnosticFinding = {
  check: 'markup',
  severity: 'warn',
  detail: { chunks: 4 },
};
const HEADERLESS: DiagnosticFinding = {
  check: 'table-without-header',
  severity: 'warn',
  detail: { chunks: 1 },
};

describe('judge', () => {
  it('passes a must-fire check only when it fires on every file', () => {
    const [partial] = judge([
      row('raw-xml', 'a.xlsx', [MARKUP]),
      row('raw-xml', 'b.xlsx'),
    ]);
    expect(partial).toMatchObject({ files: 2, firing: 1, pass: false });

    const [all] = judge([
      row('raw-xml', 'a.xlsx', [MARKUP]),
      row('raw-xml', 'b.xlsx', [MARKUP]),
    ]);
    expect(all.pass).toBe(true);
  });

  it('fails a must-not-fire check on a single file', () => {
    const [result] = judge([
      row('docling-table-chunks', 'a.md'),
      row('docling-table-chunks', 'b.md', [HEADERLESS]),
    ]);
    expect(result).toMatchObject({
      check: 'table-without-header',
      firing: 1,
      pass: false,
    });
  });

  it('judges only the shapes that ran', () => {
    expect(judge([row('docling', 'a.md')]).map((r) => r.shape)).toEqual([
      'docling',
    ]);
    expect(judge([])).toEqual([]);
  });
});

describe('renderReport', () => {
  const rows = [
    row('raw-xml', 'sheet.xlsx', [MARKUP]),
    row('docling-table-chunks', 'limits.md'),
  ];
  const text = renderReport(rows, { date: '2026-09-27', commit: 'abc123' });

  it('states the result of every expectation', () => {
    expect(text).toContain(
      '| raw-xml | `markup` | every file | 1 | 1 | pass |',
    );
    expect(text).toContain(
      '| docling-table-chunks | `table-without-header` | no file | 1 | 0 | pass |',
    );
  });

  it('has a column only for checks that fired somewhere', () => {
    expect(text).toContain('| `markup` |');
    expect(text).not.toContain('`over-budget` |');
  });

  it('marks a warning with its chunk count, and silence with a dot', () => {
    expect(text).toContain('| sheet.xlsx | indexes | 10 | 2 | W 4 |');
    expect(text).toContain('| limits.md | indexes | 10 | 2 | · |');
  });

  it('says what refused ingest', () => {
    const refused = renderReport(
      [{ ...row('raw-xml', 'sheet.xlsx', [MARKUP]), ingestRefuses: 'markup' }],
      { date: '2026-09-27', commit: 'abc123' },
    );
    expect(refused).toContain('| sheet.xlsx | markup |');
  });
});

describe('missingShapes', () => {
  const expected = ['tabele/docling', 'tabele/docling-table-chunks'];

  it('names a shape the rows do not cover', () => {
    expect(missingShapes([row('docling', 'a.md')], expected)).toEqual([
      'tabele/docling-table-chunks',
    ]);
  });

  it('is empty when every shape is there', () => {
    expect(
      missingShapes(
        [row('docling', 'a.md'), row('docling-table-chunks', 'a.md')],
        expected,
      ),
    ).toEqual([]);
  });
});
