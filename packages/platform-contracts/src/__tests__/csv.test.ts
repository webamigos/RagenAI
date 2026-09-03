import { describe, expect, it } from 'vitest';

import {
  buildCsvString,
  csvDownloadHeaders,
  escapeCsvCell,
  safeCsvFilename,
} from '../csv/csv';

/**
 * The security half. A spreadsheet evaluates a cell beginning with one of these
 * as a formula, so the file we hand a customer can run `=HYPERLINK(...)` or a
 * DDE payload on their machine. Neutralising happens where the file is written,
 * because that is the last point we control.
 */
describe('formula injection', () => {
  it.each([
    ['equals', '=1+1'],
    ['plus', '+1'],
    ['minus', '-1'],
    ['at', '@SUM(A1)'],
    ['tab', '\tHYPERLINK'],
    ['carriage return', '\rcmd'],
    ['line feed', '\n=1+1'],
  ])('neutralises a leading %s', (_label, value) => {
    expect(escapeCsvCell(value).replace(/^"/, '')).toMatch(/^'/);
  });

  it('neutralises the classic DDE payload', () => {
    const cell = escapeCsvCell("=cmd|' /C calc'!A0");
    expect(cell.startsWith('"\'=') || cell.startsWith("'=")).toBe(true);
  });

  it('leaves a formula character that is not leading alone', () => {
    expect(escapeCsvCell('a=b')).toBe('a=b');
  });

  it('does not prefix an ordinary value', () => {
    expect(escapeCsvCell('gpt-5.4')).toBe('gpt-5.4');
  });

  // A negative number reads as a formula start, so it is prefixed. That is the
  // documented trade — a visible apostrophe beats an executed cell.
  it('prefixes a negative number, deliberately', () => {
    expect(escapeCsvCell(-42)).toBe("'-42");
  });
});

describe('RFC 4180 quoting', () => {
  it.each([
    ['a comma', 'a,b', '"a,b"'],
    ['a newline', 'a\nb', '"a\nb"'],
    ['a carriage return', 'a\rb', '"a\rb"'],
  ])('quotes a value containing %s', (_label, input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it('doubles an embedded quote', () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('keeps the apostrophe inside the quotes when both apply', () => {
    // Prefixing after quoting would put the apostrophe outside and lose it.
    expect(escapeCsvCell('=a,b')).toBe('"\'=a,b"');
  });
});

describe('empty and non-string values', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('renders %s as an empty cell', (_label, value) => {
    expect(escapeCsvCell(value)).toBe('');
  });

  it('renders an empty string as an empty cell', () => {
    expect(escapeCsvCell('')).toBe('');
  });

  it.each([
    ['a number', 42, '42'],
    ['zero', 0, '0'],
    ['false', false, 'false'],
  ])('stringifies %s', (_label, value, expected) => {
    expect(escapeCsvCell(value)).toBe(expected);
  });
});

describe('buildCsvString', () => {
  it('writes a header row and one row per record', () => {
    const csv = buildCsvString([
      { name: 'Acme', seats: 3 },
      { name: 'Globex', seats: 1 },
    ]);

    expect(csv.split('\n')).toEqual(['name,seats', 'Acme,3', 'Globex,1']);
  });

  it('returns an empty string for no rows and no headers', () => {
    expect(buildCsvString([])).toBe('');
  });

  it('writes just the header row when given headers and no rows', () => {
    expect(buildCsvString([], ['a', 'b'])).toBe('a,b');
  });

  /**
   * Inferring columns from the first row drops any column whose first value is
   * null — which is exactly what a database export looks like.
   */
  it('keeps a column whose first value is null when headers are explicit', () => {
    const csv = buildCsvString(
      [
        { name: 'Acme', note: null },
        { name: 'Globex', note: 'hello' },
      ],
      ['name', 'note'],
    );

    expect(csv).toBe('name,note\nAcme,\nGlobex,hello');
  });

  it('follows the given header order, not the object key order', () => {
    expect(buildCsvString([{ b: 2, a: 1 }], ['a', 'b'])).toBe('a,b\n1,2');
  });

  it('escapes header names too', () => {
    expect(buildCsvString([], ['=evil'])).toBe("'=evil");
  });
});

describe('safeCsvFilename', () => {
  it('appends the extension when missing', () => {
    expect(safeCsvFilename('activity-log')).toBe('activity-log.csv');
  });

  it('keeps an extension that is already there', () => {
    expect(safeCsvFilename('report.csv')).toBe('report.csv');
  });

  // The value often comes from a customer-chosen name, and a quote or newline
  // in a Content-Disposition header is a response-splitting problem.
  it.each([
    ['a quote', 'a"b'],
    ['a newline', 'a\nb'],
    ['a semicolon', 'a;b'],
    ['a path traversal', '../../etc/passwd'],
  ])('strips %s', (_label, input) => {
    const result = safeCsvFilename(input);
    expect(result).toMatch(/^[a-zA-Z0-9._-]+\.csv$/);
  });

  it('falls back to a default when nothing survives', () => {
    expect(safeCsvFilename('///')).toBe('export.csv');
  });
});

describe('csvDownloadHeaders', () => {
  it('marks the response as a CSV attachment', () => {
    const headers = csvDownloadHeaders('activity-log');

    expect(headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(headers['content-disposition']).toBe(
      'attachment; filename="activity-log.csv"',
    );
  });

  // These exports carry customer data; a shared cache must not keep them.
  it('forbids caching', () => {
    expect(csvDownloadHeaders('x')['cache-control']).toBe('no-store');
  });

  it('sanitises the filename it puts in the header', () => {
    expect(csvDownloadHeaders('a"b')['content-disposition']).not.toContain(
      'a"b',
    );
  });
});
