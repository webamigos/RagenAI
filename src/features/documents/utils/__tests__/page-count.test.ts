import { describe, it, expect } from 'vitest';
import { calculatePageCount } from '../page-count';

describe('calculatePageCount', () => {
  describe('PDF files', () => {
    it('returns actual page count from pdfPages', () => {
      expect(calculatePageCount('PDF', { pdfPages: 42 })).toBe(42);
    });

    it('returns 1 when pdfPages is not provided', () => {
      expect(calculatePageCount('PDF', {})).toBe(1);
    });
  });

  describe('IMAGE files', () => {
    it('always returns 1', () => {
      expect(calculatePageCount('IMAGE', {})).toBe(1);
    });

    it('ignores contentLength', () => {
      expect(calculatePageCount('IMAGE', { contentLength: 100000 })).toBe(1);
    });
  });

  describe('text-based files', () => {
    it.each([
      'TEXT',
      'MARKDOWN',
      'DOCX',
      'CSV',
      'XLSX',
      'SRT',
      'EPUB',
      'URL',
    ] as const)('%s: returns 1 for content under 3000 chars', (fileType) => {
      expect(calculatePageCount(fileType, { contentLength: 1500 })).toBe(1);
    });

    it('returns 1 for exactly 3000 chars', () => {
      expect(calculatePageCount('TEXT', { contentLength: 3000 })).toBe(1);
    });

    it('returns 2 for 3001 chars', () => {
      expect(calculatePageCount('TEXT', { contentLength: 3001 })).toBe(2);
    });

    it('returns 10 for 30000 chars', () => {
      expect(calculatePageCount('DOCX', { contentLength: 30000 })).toBe(10);
    });

    it('returns minimum 1 when contentLength is 0', () => {
      expect(calculatePageCount('TEXT', { contentLength: 0 })).toBe(1);
    });

    it('returns minimum 1 when contentLength is not provided', () => {
      expect(calculatePageCount('CSV', {})).toBe(1);
    });
  });

  describe('UNKNOWN file type', () => {
    it('uses text-based calculation', () => {
      expect(calculatePageCount('UNKNOWN', { contentLength: 6000 })).toBe(2);
    });
  });
});
