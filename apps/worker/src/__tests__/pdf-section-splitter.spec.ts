import { splitPdfDocuments } from '../services/text-splitters/pdf-section-splitter';
import type { Document } from '../types/Document';

describe('splitPdfDocuments', () => {
  function makeDoc(
    content: string,
    metadata: Record<string, unknown> = {},
  ): Document {
    return {
      pageContent: content,
      metadata: {
        source: 'test.pdf',
        type: 'claude_pdf_extraction',
        ...metadata,
      },
    };
  }

  it('passes short sections through unchanged', () => {
    const doc = makeDoc('Short section body', { sectionPath: 'Chapter 1' });
    const result = splitPdfDocuments([doc], {
      chunkSize: 1000,
      chunkOverlap: 0,
    });
    expect(result).toHaveLength(1);
    expect(result[0].pageContent).toBe('Short section body');
    expect(result[0].metadata.sectionPath).toBe('Chapter 1');
  });

  it('recursively splits a long section into multiple chunks', () => {
    const longContent = 'word '.repeat(500).trim(); // ~2500 chars
    const doc = makeDoc(longContent, { sectionPath: 'Big Section' });
    const result = splitPdfDocuments([doc], {
      chunkSize: 500,
      chunkOverlap: 50,
    });
    expect(result.length).toBeGreaterThan(1);
  });

  it('preserves sectionPath on every sub-chunk when splitting a long section', () => {
    const longContent = 'sentence. '.repeat(200).trim();
    const doc = makeDoc(longContent, {
      sectionPath: 'Chapter 3 > 3.2 Revenue',
    });
    const result = splitPdfDocuments([doc], {
      chunkSize: 300,
      chunkOverlap: 30,
    });
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.metadata.sectionPath).toBe('Chapter 3 > 3.2 Revenue');
      expect(chunk.metadata.type).toBe('claude_pdf_extraction');
      expect(chunk.metadata.source).toBe('test.pdf');
    }
  });

  it('handles documents without sectionPath (flat-text fallback path)', () => {
    const longContent = 'word '.repeat(500).trim();
    const doc = makeDoc(longContent); // no sectionPath
    const result = splitPdfDocuments([doc], {
      chunkSize: 500,
      chunkOverlap: 50,
    });
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.metadata.sectionPath).toBeUndefined();
    }
  });

  it('handles multiple input sections independently', () => {
    const shortDoc = makeDoc('Short one', { sectionPath: 'A' });
    const longDoc = makeDoc('x '.repeat(400).trim(), {
      sectionPath: 'B',
    });
    const result = splitPdfDocuments([shortDoc, longDoc], {
      chunkSize: 400,
      chunkOverlap: 20,
    });
    // Short passes through as 1 chunk; long gets split into 2+ chunks
    expect(result.length).toBeGreaterThan(1);
    expect(result[0].pageContent).toBe('Short one');
    expect(result[0].metadata.sectionPath).toBe('A');
    for (let i = 1; i < result.length; i++) {
      expect(result[i].metadata.sectionPath).toBe('B');
    }
  });

  it('returns empty array for empty input', () => {
    expect(splitPdfDocuments([], { chunkSize: 100, chunkOverlap: 20 })).toEqual(
      [],
    );
  });

  it('keeps content exactly at the chunk-size boundary as one chunk', () => {
    // Edge case: content.length === chunkSize should NOT trigger a split
    const content = 'a'.repeat(500);
    const doc = makeDoc(content, { sectionPath: 'Edge' });
    const result = splitPdfDocuments([doc], {
      chunkSize: 500,
      chunkOverlap: 50,
    });
    expect(result).toHaveLength(1);
    expect(result[0].pageContent).toBe(content);
  });
});
