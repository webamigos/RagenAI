import {
  parseCsvRows,
  splitCsvDocuments,
} from '../services/text-splitters/csv-row-group-splitter';
import type { Document } from '../types/Document';

describe('parseCsvRows', () => {
  it('parses a simple three-row CSV', () => {
    const csv = 'name,age\nAlice,30\nBob,25';
    expect(parseCsvRows(csv)).toEqual([
      ['name', 'age'],
      ['Alice', '30'],
      ['Bob', '25'],
    ]);
  });

  it('handles CRLF line endings', () => {
    const csv = 'a,b\r\n1,2\r\n3,4\r\n';
    expect(parseCsvRows(csv)).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('handles quoted fields with commas inside', () => {
    const csv = 'name,city\n"Smith, John","New York, NY"\n';
    expect(parseCsvRows(csv)).toEqual([
      ['name', 'city'],
      ['Smith, John', 'New York, NY'],
    ]);
  });

  it('handles escaped quotes inside quoted fields', () => {
    const csv = 'name,quote\nA,"She said ""hello"" today"';
    expect(parseCsvRows(csv)).toEqual([
      ['name', 'quote'],
      ['A', 'She said "hello" today'],
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(parseCsvRows('')).toEqual([]);
  });

  it('drops trailing empty rows from a trailing newline', () => {
    const csv = 'a\n1\n';
    expect(parseCsvRows(csv)).toEqual([['a'], ['1']]);
  });
});

describe('splitCsvDocuments', () => {
  function makeDoc(content: string, metadata: Record<string, unknown> = {}) {
    return {
      pageContent: content,
      metadata: { source: 'test', ...metadata },
    } as Document;
  }

  it('returns a single chunk for a header-only CSV', () => {
    const result = splitCsvDocuments([makeDoc('name,age')], {
      chunkSize: 1000,
    });
    expect(result).toHaveLength(1);
    expect(result[0].pageContent).toBe('name,age');
  });

  it('returns a single chunk when body fits in the budget', () => {
    const csv = 'name,age\nAlice,30\nBob,25\nCarol,40';
    const result = splitCsvDocuments([makeDoc(csv)], { chunkSize: 1000 });
    expect(result).toHaveLength(1);
    expect(result[0].pageContent).toBe(csv);
  });

  it('repeats the header row in every chunk when the body is split', () => {
    // Header is 8 chars; each body row is about 9 chars. chunkSize=30
    // should fit header + ~2 body rows per chunk.
    const csv = [
      'name,age',
      'Alice,30',
      'Bob,25',
      'Carol,40',
      'Dave,55',
      'Eve,28',
    ].join('\n');

    const result = splitCsvDocuments([makeDoc(csv)], { chunkSize: 30 });

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.pageContent.startsWith('name,age')).toBe(true);
    }
    // All body rows should appear somewhere across the chunks
    const joined = result.map((c) => c.pageContent).join('\n');
    expect(joined).toContain('Alice');
    expect(joined).toContain('Bob');
    expect(joined).toContain('Carol');
    expect(joined).toContain('Dave');
    expect(joined).toContain('Eve');
  });

  it('propagates incoming metadata to every chunk', () => {
    const csv = 'a,b\n1,2\n3,4\n5,6';
    const result = splitCsvDocuments(
      // Loader-side metadata uses camelCase (matches the XLSX loader's
      // convention); prepareMetadata maps sheetName → sheet_name when
      // building the Qdrant canonical shape.
      [makeDoc(csv, { sheetName: 'Sheet1', fileName: 'budget.xlsx' })],
      { chunkSize: 10 },
    );
    expect(result.length).toBeGreaterThan(0);
    for (const chunk of result) {
      expect(chunk.metadata.sheetName).toBe('Sheet1');
      expect(chunk.metadata.fileName).toBe('budget.xlsx');
    }
  });

  it('re-serializes quoted fields correctly in output chunks', () => {
    const csv = 'name,note\n"Smith, John","He said ""hi"""';
    const result = splitCsvDocuments([makeDoc(csv)], { chunkSize: 1000 });
    expect(result).toHaveLength(1);
    // The output must preserve the quoted field semantics — parsing it
    // back should yield the same rows.
    expect(parseCsvRows(result[0].pageContent)).toEqual([
      ['name', 'note'],
      ['Smith, John', 'He said "hi"'],
    ]);
  });

  it('emits oversized rows as their own chunks with header repeated', () => {
    const huge = 'x'.repeat(200);
    const csv = `id,payload\n1,${huge}\n2,small`;
    const result = splitCsvDocuments([makeDoc(csv)], { chunkSize: 50 });
    // Every chunk must still start with the header row
    for (const chunk of result) {
      expect(chunk.pageContent.startsWith('id,payload')).toBe(true);
    }
  });

  it('handles multiple input documents independently (multi-sheet XLSX)', () => {
    const sheet1 = makeDoc('col1,col2\na,b\nc,d', { sheetName: 'Sheet1' });
    const sheet2 = makeDoc('colX,colY\n1,2\n3,4', { sheetName: 'Sheet2' });
    const result = splitCsvDocuments([sheet1, sheet2], { chunkSize: 1000 });
    expect(result).toHaveLength(2);
    expect(result[0].metadata.sheetName).toBe('Sheet1');
    expect(result[1].metadata.sheetName).toBe('Sheet2');
  });

  it('returns empty array for empty input', () => {
    expect(splitCsvDocuments([], { chunkSize: 100 })).toEqual([]);
  });
});
