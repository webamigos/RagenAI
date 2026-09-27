import { describe, expect, it } from 'vitest';

import { canOptimizeFileType, isTabularFileType } from '../tabular-documents';

describe('isTabularFileType', () => {
  it.each(['XLSX', 'CSV'])('is true for %s', (type) => {
    expect(isTabularFileType(type)).toBe(true);
  });

  it.each(['PDF', 'DOCX', 'MARKDOWN', 'TEXT', 'IMAGE', null, undefined])(
    'is false for %s',
    (type) => {
      expect(isTabularFileType(type)).toBe(false);
    },
  );
});

describe('canOptimizeFileType', () => {
  it.each(['XLSX', 'CSV', 'IMAGE'])('refuses %s', (type) => {
    expect(canOptimizeFileType(type)).toBe(false);
  });

  it.each(['PDF', 'DOCX', 'MARKDOWN', 'TEXT'])('offers %s', (type) => {
    expect(canOptimizeFileType(type)).toBe(true);
  });

  // A document written in the panel has no file behind it; it is prose.
  it('offers a document with no file', () => {
    expect(canOptimizeFileType(null)).toBe(true);
    expect(canOptimizeFileType(undefined)).toBe(true);
  });
});
