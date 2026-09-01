import { calculatePageCount } from './page-count.js';

describe('calculatePageCount', () => {
  it('uses pdfPages for PDF files, defaulting to 1', () => {
    expect(calculatePageCount('PDF', { pdfPages: 5 })).toBe(5);
    expect(calculatePageCount('PDF', {})).toBe(1);
  });

  it('always counts images as 1 page', () => {
    expect(calculatePageCount('IMAGE', { contentLength: 5000 })).toBe(1);
  });

  it('estimates text-based file pages from content length', () => {
    expect(calculatePageCount('TEXT', { contentLength: 3000 })).toBe(1);
    expect(calculatePageCount('TEXT', { contentLength: 3001 })).toBe(2);
    expect(calculatePageCount('TEXT', { contentLength: 0 })).toBe(1);
    expect(calculatePageCount('MARKDOWN', {})).toBe(1);
  });
});
