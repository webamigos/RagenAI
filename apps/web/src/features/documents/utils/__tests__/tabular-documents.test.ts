import { describe, expect, it } from 'vitest';

import {
  canOptimizeDocument,
  isMostlyTableChunks,
  isTabularDocument,
  MOSTLY_TABLE_SHARE,
} from '../tabular-documents';

/** `UserFile.metadata` carrying a report with these counts, as C2 writes it. */
const withChunks = (chunkCount: number, tableChunkCount: number) => ({
  summary: 'x',
  diagnostics: {
    version: 1,
    computedAt: '2026-09-27T12:00:00.000Z',
    findings: [],
    stats: {
      chunkCount,
      tableChunkCount,
      medianChunkChars: 700,
      sectionPathShare: null,
      overlapShare: 0.2,
    },
  },
});

describe('isMostlyTableChunks (spec D2)', () => {
  it('is true above half, and not at exactly half', () => {
    expect(MOSTLY_TABLE_SHARE).toBe(0.5);
    // The Phase A price lists with table chunks on (C4): 6 of 7, 5 of 6.
    expect(isMostlyTableChunks(withChunks(7, 6))).toBe(true);
    expect(isMostlyTableChunks(withChunks(6, 5))).toBe(true);
    expect(isMostlyTableChunks(withChunks(3, 2))).toBe(true);
    expect(isMostlyTableChunks(withChunks(4, 2))).toBe(false);
  });

  it('is false for prose with a table in it', () => {
    expect(isMostlyTableChunks(withChunks(10, 1))).toBe(false);
    expect(isMostlyTableChunks(withChunks(5, 0))).toBe(false);
  });

  // "Not computed" is not evidence of a table.
  it.each([
    ['no metadata', undefined],
    ['a file indexed before diagnostics', { summary: 'x' }],
    ['checks that threw', { diagnostics: null }],
    ['a report with no chunks', withChunks(0, 0)],
  ])('is false for %s', (_, metadata) => {
    expect(isMostlyTableChunks(metadata)).toBe(false);
  });
});

describe('isTabularDocument', () => {
  it.each(['XLSX', 'CSV'])('is true for %s whatever its chunks', (fileType) => {
    expect(isTabularDocument({ fileType })).toBe(true);
    expect(isTabularDocument({ fileType, metadata: withChunks(5, 0) })).toBe(
      true,
    );
  });

  it('is true for a PDF that is mostly table chunks', () => {
    expect(
      isTabularDocument({ fileType: 'PDF', metadata: withChunks(7, 6) }),
    ).toBe(true);
  });

  it('is false for a PDF of prose, or one never checked', () => {
    expect(
      isTabularDocument({ fileType: 'PDF', metadata: withChunks(7, 1) }),
    ).toBe(false);
    expect(isTabularDocument({ fileType: 'PDF' })).toBe(false);
  });
});

describe('canOptimizeDocument', () => {
  it.each(['XLSX', 'CSV', 'IMAGE'])('refuses %s', (fileType) => {
    expect(canOptimizeDocument({ fileType })).toBe(false);
  });

  it('refuses a DOCX that is mostly table chunks', () => {
    expect(
      canOptimizeDocument({ fileType: 'DOCX', metadata: withChunks(3, 2) }),
    ).toBe(false);
  });

  it.each(['PDF', 'DOCX', 'MARKDOWN', 'TEXT'])('offers prose %s', (type) => {
    expect(
      canOptimizeDocument({ fileType: type, metadata: withChunks(8, 1) }),
    ).toBe(true);
  });

  it('offers a document written in the panel, with no file', () => {
    expect(canOptimizeDocument({ fileType: null })).toBe(true);
    expect(canOptimizeDocument({})).toBe(true);
  });
});
