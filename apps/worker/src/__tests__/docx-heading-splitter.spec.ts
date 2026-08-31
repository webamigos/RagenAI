import {
  parseDocxHtml,
  splitDocxDocuments,
} from '../services/text-splitters/docx-heading-splitter';
import type { Document } from '../types/Document';

describe('parseDocxHtml', () => {
  it('parses headings with their levels', () => {
    const html = '<h1>Chapter 1</h1><h2>1.1 Background</h2><h3>Details</h3>';
    expect(parseDocxHtml(html)).toEqual([
      { kind: 'heading', level: 1, text: 'Chapter 1' },
      { kind: 'heading', level: 2, text: '1.1 Background' },
      { kind: 'heading', level: 3, text: 'Details' },
    ]);
  });

  it('parses paragraphs', () => {
    const html = '<p>First paragraph.</p><p>Second paragraph.</p>';
    expect(parseDocxHtml(html)).toEqual([
      { kind: 'paragraph', text: 'First paragraph.' },
      { kind: 'paragraph', text: 'Second paragraph.' },
    ]);
  });

  it('strips inline formatting tags but keeps their text', () => {
    const html =
      '<p>Hello <strong>bold</strong> and <em>italic</em> world.</p>';
    expect(parseDocxHtml(html)).toEqual([
      { kind: 'paragraph', text: 'Hello bold and italic world.' },
    ]);
  });

  it('decodes common HTML entities', () => {
    const html = '<p>A &amp; B &lt; C &quot;quoted&quot;</p>';
    expect(parseDocxHtml(html)).toEqual([
      { kind: 'paragraph', text: 'A & B < C "quoted"' },
    ]);
  });

  it('extracts list items as paragraphs', () => {
    const html = '<ul><li>First item</li><li>Second item</li></ul>';
    expect(parseDocxHtml(html)).toEqual([
      { kind: 'paragraph', text: 'First item' },
      { kind: 'paragraph', text: 'Second item' },
    ]);
  });

  it('skips empty blocks', () => {
    const html = '<p></p><p>   </p><p>Real content</p>';
    expect(parseDocxHtml(html)).toEqual([
      { kind: 'paragraph', text: 'Real content' },
    ]);
  });
});

describe('splitDocxDocuments', () => {
  function makeDoc(html: string, metadata: Record<string, unknown> = {}) {
    return {
      pageContent: html,
      metadata: { fileName: 'test.docx', ...metadata },
    } as Document;
  }

  it('produces one chunk per heading when paragraphs fit the budget', () => {
    const html =
      '<h1>Chapter 1</h1><p>Intro text.</p>' +
      '<h2>Section A</h2><p>Content A.</p>' +
      '<h2>Section B</h2><p>Content B.</p>';

    const result = splitDocxDocuments([makeDoc(html)], {
      chunkSize: 1000,
      chunkOverlap: 0,
    });

    expect(result).toHaveLength(3);
    expect(result[0].pageContent).toBe('Intro text.');
    expect(result[0].metadata.sectionPath).toBe('Chapter 1');
    expect(result[1].pageContent).toBe('Content A.');
    expect(result[1].metadata.sectionPath).toBe('Chapter 1 > Section A');
    expect(result[2].pageContent).toBe('Content B.');
    expect(result[2].metadata.sectionPath).toBe('Chapter 1 > Section B');
  });

  it('preserves heading hierarchy across three levels', () => {
    const html =
      '<h1>Part I</h1>' +
      '<h2>Chapter 1</h2>' +
      '<h3>1.1 First subsection</h3>' +
      '<p>Deep content here.</p>';

    const result = splitDocxDocuments([makeDoc(html)], {
      chunkSize: 1000,
      chunkOverlap: 0,
    });

    expect(result).toHaveLength(1);
    expect(result[0].metadata.sectionPath).toBe(
      'Part I > Chapter 1 > 1.1 First subsection',
    );
  });

  it('pops deeper heading levels when a shallower heading appears', () => {
    const html =
      '<h1>Chapter A</h1>' +
      '<h2>Section A1</h2>' +
      '<h3>Sub A1.1</h3>' +
      '<p>Content in deep slot.</p>' +
      '<h2>Section A2</h2>' +
      '<p>Back at level 2.</p>';

    const result = splitDocxDocuments([makeDoc(html)], {
      chunkSize: 1000,
      chunkOverlap: 0,
    });

    expect(result).toHaveLength(2);
    expect(result[0].metadata.sectionPath).toBe(
      'Chapter A > Section A1 > Sub A1.1',
    );
    expect(result[1].metadata.sectionPath).toBe('Chapter A > Section A2');
  });

  it('splits long text within a single section, keeping sectionPath', () => {
    const longParagraph = 'word '.repeat(200).trim();
    const html = `<h1>Big Section</h1><p>${longParagraph}</p>`;

    const result = splitDocxDocuments([makeDoc(html)], {
      chunkSize: 100,
      chunkOverlap: 20,
    });

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.metadata.sectionPath).toBe('Big Section');
    }
  });

  it('omits sectionPath when no headings exist', () => {
    const html = '<p>Just a paragraph.</p><p>Another one.</p>';
    const result = splitDocxDocuments([makeDoc(html)], {
      chunkSize: 1000,
      chunkOverlap: 0,
    });
    expect(result).toHaveLength(1);
    expect(result[0].metadata.sectionPath).toBeUndefined();
  });

  it('handles a heading stack with gaps (h1 then h3 with no h2)', () => {
    const html = '<h1>Top</h1><h3>Deep</h3><p>Orphaned deep content.</p>';
    const result = splitDocxDocuments([makeDoc(html)], {
      chunkSize: 1000,
      chunkOverlap: 0,
    });
    // The splitter should still produce a meaningful sectionPath
    // including both headings; missing h2 slot is omitted.
    expect(result).toHaveLength(1);
    expect(result[0].metadata.sectionPath).toBe('Top > Deep');
  });

  it('falls back to recursive splitting when no parseable blocks exist', () => {
    const plain = 'Just some plain text not wrapped in tags.';
    const result = splitDocxDocuments([makeDoc(plain)], {
      chunkSize: 1000,
      chunkOverlap: 0,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].pageContent.trim().length).toBeGreaterThan(0);
  });

  it('propagates source metadata to all chunks', () => {
    const html = '<h1>Title</h1><p>Body.</p>';
    const result = splitDocxDocuments(
      [makeDoc(html, { fileName: 'contract.docx', fileId: 'abc' })],
      { chunkSize: 1000, chunkOverlap: 0 },
    );
    for (const chunk of result) {
      expect(chunk.metadata.fileName).toBe('contract.docx');
      expect(chunk.metadata.fileId).toBe('abc');
    }
  });
});
