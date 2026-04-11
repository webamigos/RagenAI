import { describe, it, expect } from 'vitest';
import { combineDocuments } from '../chain-utils';
import type { VectorStoreDocument } from '@/libs/vector-store/types';

function doc(
  pageContent: string,
  metadata: Record<string, unknown> = {},
): VectorStoreDocument {
  return { pageContent, metadata };
}

describe('combineDocuments', () => {
  it('wraps a chunk with file and section attributes when both are present', () => {
    const result = combineDocuments([
      doc('Revenue terms...', {
        file_name: 'contract.pdf',
        section_path: 'Chapter 3 > 3.2 Revenue terms',
      }),
    ]);

    expect(result).toContain('<chunk');
    expect(result).toContain('file="contract.pdf"');
    expect(result).toContain('section="Chapter 3 &gt; 3.2 Revenue terms"');
    expect(result).toContain('Revenue terms...');
    expect(result).toContain('</chunk>');
  });

  it('omits the section attribute when section_path is missing', () => {
    const result = combineDocuments([
      doc('Plain content.', { file_name: 'notes.md' }),
    ]);

    expect(result).toContain('file="notes.md"');
    expect(result).not.toContain('section=');
  });

  it('omits the section attribute when section_path is an empty string', () => {
    const result = combineDocuments([
      doc('Content', { file_name: 'notes.md', section_path: '' }),
    ]);

    expect(result).not.toContain('section=');
  });

  it('omits the section attribute when section_path is whitespace only', () => {
    const result = combineDocuments([
      doc('Content', { file_name: 'notes.md', section_path: '   ' }),
    ]);

    expect(result).not.toContain('section=');
  });

  it('adds type="summary" attribute for synthetic summary chunks (ADR-16)', () => {
    const result = combineDocuments([
      doc('Document overview paragraph.', {
        file_name: 'report.pdf',
        chunk_type: 'summary',
      }),
    ]);

    expect(result).toContain('file="report.pdf"');
    expect(result).toContain('type="summary"');
  });

  it('does not add type attribute for body chunks without chunk_type', () => {
    const result = combineDocuments([
      doc('Body content.', { file_name: 'report.pdf' }),
    ]);

    expect(result).not.toContain('type=');
  });

  it('falls back to bare content when file_name metadata is missing', () => {
    const result = combineDocuments([doc('Legacy chunk with no filename.')]);

    expect(result).not.toContain('<chunk');
    expect(result).toBe('Legacy chunk with no filename.');
  });

  it('falls back to bare content when metadata is undefined entirely', () => {
    const result = combineDocuments([
      { pageContent: 'No metadata at all' } as unknown as VectorStoreDocument,
    ]);

    expect(result).not.toContain('<chunk');
    expect(result).toBe('No metadata at all');
  });

  it('joins multiple chunks with double newline separator', () => {
    const result = combineDocuments([
      doc('First chunk', { file_name: 'a.txt' }),
      doc('Second chunk', { file_name: 'b.txt' }),
    ]);

    // Two wrapped chunks separated by a blank line
    expect(result.split('\n\n').length).toBeGreaterThanOrEqual(2);
    expect(result).toContain('file="a.txt"');
    expect(result).toContain('file="b.txt"');
  });

  it('handles a mixed batch: with/without section, with/without summary, with/without file_name', () => {
    const result = combineDocuments([
      doc('Section chunk', {
        file_name: 'contract.pdf',
        section_path: 'Section 1',
      }),
      doc('Summary chunk', {
        file_name: 'contract.pdf',
        chunk_type: 'summary',
      }),
      doc('Legacy chunk'),
    ]);

    expect(result).toContain('file="contract.pdf"');
    expect(result).toContain('section="Section 1"');
    expect(result).toContain('type="summary"');
    expect(result).toContain('Legacy chunk');
    // Legacy chunk should NOT be wrapped
    expect(result).toContain('\n\nLegacy chunk');
  });

  it('escapes special XML characters in file_name and section_path attributes', () => {
    const result = combineDocuments([
      doc('Content', {
        file_name: 'q&a "notes".pdf',
        section_path: '1 < 2 > 0',
      }),
    ]);

    // Escaped forms must appear
    expect(result).toContain('file="q&amp;a &quot;notes&quot;.pdf"');
    expect(result).toContain('section="1 &lt; 2 &gt; 0"');
    // Naked double-quotes inside the attribute would break XML — the only
    // literal " in the wrapper should be the attribute delimiters. Count
    // them: two attributes + opening/closing wrapper = exactly 4 quotes
    // from the wrapper, plus whatever appears in pageContent (none here).
    const quoteCount = (result.match(/"/g) || []).length;
    expect(quoteCount).toBe(4);
  });

  it('ignores non-string file_name and section_path values safely', () => {
    const result = combineDocuments([
      doc('Content', {
        file_name: 42 as unknown as string,
        section_path: null as unknown as string,
      }),
    ]);

    // Non-string file_name → no wrapper, falls back to bare content
    expect(result).toBe('Content');
  });

  it('returns an empty string for an empty documents array', () => {
    expect(combineDocuments([])).toBe('');
  });

  it('preserves multi-line pageContent verbatim inside the wrapper', () => {
    const content = 'Line one\nLine two\n\nAfter blank line';
    const result = combineDocuments([doc(content, { file_name: 'notes.txt' })]);

    expect(result).toContain(content);
  });
});
