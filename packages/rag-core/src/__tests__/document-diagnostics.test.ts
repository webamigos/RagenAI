import { describe, expect, it } from 'vitest';

import {
  DIAGNOSTIC_CHECKS,
  readDocumentDiagnostics,
  sortFindings,
  warningsOf,
} from '../document-diagnostics';

const stored = (diagnostics: unknown) => ({ summary: 'x', diagnostics });

const valid = {
  version: 1,
  computedAt: '2026-09-27T12:00:00.000Z',
  findings: [
    {
      check: 'over-budget',
      severity: 'info',
      detail: { chunks: 1, budget: 800 },
    },
    { check: 'markup', severity: 'warn', detail: { chunks: 2 } },
  ],
  stats: {
    chunkCount: 12,
    tableChunkCount: 2,
    medianChunkChars: 640,
    sectionPathShare: null,
    overlapShare: 0.21,
  },
};

describe('readDocumentDiagnostics', () => {
  it('reads what the worker writes', () => {
    expect(readDocumentDiagnostics(stored(valid))).toEqual(valid);
  });

  // Absence means "not computed", never "nothing found" — so every way the
  // key can fail to be a report reads as absent, not as an empty report.
  it.each([
    ['metadata that is not an object', null],
    ['a row written before diagnostics existed', { summary: 'x' }],
    ['a run whose checks threw', stored(null)],
    ['a version this release does not know', stored({ ...valid, version: 2 })],
    ['findings that are not a list', stored({ ...valid, findings: {} })],
    ['no computedAt', stored({ ...valid, computedAt: undefined })],
  ])('is null for %s', (_, metadata) => {
    expect(readDocumentDiagnostics(metadata)).toBeNull();
  });

  // The panel keys its rows by check; a report edited by hand or merged by a
  // script can repeat one, which rendered twice under the same key.
  it('keeps one finding per check, the warning over the information', () => {
    const read = readDocumentDiagnostics(
      stored({
        ...valid,
        findings: [
          { check: 'empty-chunks', severity: 'info', detail: { chunks: 1 } },
          { check: 'markup', severity: 'warn' },
          { check: 'empty-chunks', severity: 'warn', detail: { chunks: 4 } },
          { check: 'markup', severity: 'warn', detail: { chunks: 9 } },
        ],
      }),
    );
    expect(read?.findings).toEqual([
      { check: 'empty-chunks', severity: 'warn', detail: { chunks: 4 } },
      { check: 'markup', severity: 'warn' },
    ]);
  });

  it('drops a finding it cannot render, and keeps the rest', () => {
    const read = readDocumentDiagnostics(
      stored({
        ...valid,
        findings: [
          { check: 'written-by-a-newer-worker', severity: 'warn' },
          { check: 'markup', severity: 'loud' },
          'not a finding',
          {
            check: 'empty-chunks',
            severity: 'warn',
            detail: { chunks: 3, x: {} },
          },
        ],
      }),
    );
    expect(read?.findings).toEqual([
      { check: 'empty-chunks', severity: 'warn', detail: { chunks: 3 } },
    ]);
  });

  it('fills missing stats rather than failing the whole report', () => {
    const read = readDocumentDiagnostics(
      stored({ ...valid, stats: undefined }),
    );
    expect(read?.stats).toEqual({
      chunkCount: 0,
      tableChunkCount: 0,
      medianChunkChars: 0,
      sectionPathShare: null,
      overlapShare: 0,
    });
  });
});

describe('warningsOf and sortFindings', () => {
  it('keeps only warnings, in the order the panel lists checks', () => {
    const read = readDocumentDiagnostics(
      stored({
        ...valid,
        findings: [
          { check: 'empty-chunks', severity: 'warn' },
          { check: 'overlap-duplication', severity: 'info' },
          { check: 'markup', severity: 'warn' },
        ],
      }),
    );
    expect(warningsOf(read).map((f) => f.check)).toEqual([
      'markup',
      'empty-chunks',
    ]);
  });

  it('is empty for a report that was not computed', () => {
    expect(warningsOf(null)).toEqual([]);
  });

  it('puts every warning before any information', () => {
    const sorted = sortFindings([
      { check: 'markup', severity: 'info' },
      { check: 'overlap-duplication', severity: 'warn' },
    ]);
    expect(sorted.map((f) => f.severity)).toEqual(['warn', 'info']);
  });

  it('knows every check once', () => {
    expect(new Set(DIAGNOSTIC_CHECKS).size).toBe(DIAGNOSTIC_CHECKS.length);
  });
});
