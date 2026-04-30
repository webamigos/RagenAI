import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildCsvString, exportToCsv } from '../csv';

describe('buildCsvString', () => {
  it('returns empty string for empty rows', () => {
    expect(buildCsvString([])).toBe('');
  });

  it('generates header row from object keys', () => {
    const result = buildCsvString([{ name: 'Alice', age: 30 }]);
    const lines = result.split('\n');
    expect(lines[0]).toBe('name,age');
  });

  it('escapes header names containing commas', () => {
    const result = buildCsvString([{ 'first, last': 'Alice' }]);
    const lines = result.split('\n');
    expect(lines[0]).toBe('"first, last"');
  });

  it('generates data row', () => {
    const result = buildCsvString([{ name: 'Alice', age: 30 }]);
    const lines = result.split('\n');
    expect(lines[1]).toBe('Alice,30');
  });

  it('escapes commas in values', () => {
    const result = buildCsvString([{ name: 'Smith, John' }]);
    expect(result).toContain('"Smith, John"');
  });

  it('escapes double quotes in values', () => {
    const result = buildCsvString([{ name: 'Say "hello"' }]);
    expect(result).toContain('"Say ""hello"""');
  });

  it('handles null and undefined values as empty string', () => {
    const result = buildCsvString([{ name: null, age: undefined }]);
    const lines = result.split('\n');
    expect(lines[1]).toBe(',');
  });

  it.each(['=', '+', '-', '@'])(
    "prefixes formula-starting values with a single quote (char: '%s')",
    (char) => {
      const result = buildCsvString([{ formula: `${char}SUM(A1)` }]);
      const lines = result.split('\n');
      expect(lines[1]).toBe(`'${char}SUM(A1)`);
    },
  );

  it('handles multiple rows', () => {
    const result = buildCsvString([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('Bob,25');
  });
});

describe('exportToCsv', () => {
  const MOCK_URL = 'blob:mock-url';
  const rows = [{ name: 'Alice', age: 30 }];

  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let mockAnchor: HTMLAnchorElement;
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let removeChildSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURL = vi.fn().mockReturnValue(MOCK_URL);
    revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    } as unknown as HTMLAnchorElement;

    createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(mockAnchor);
    appendChildSpy = vi
      .spyOn(document.body, 'appendChild')
      .mockReturnValue(mockAnchor);
    removeChildSpy = vi
      .spyOn(document.body, 'removeChild')
      .mockReturnValue(mockAnchor);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('calls createObjectURL with a Blob containing the CSV content', () => {
    exportToCsv(rows, 'test.csv');

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/csv;charset=utf-8;');
  });

  it('sets href and download on the anchor element', () => {
    exportToCsv(rows, 'test.csv');

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(mockAnchor.href).toBe(MOCK_URL);
    expect(mockAnchor.download).toBe('test.csv');
  });

  it('appends the anchor, clicks it, then removes it', () => {
    exportToCsv(rows, 'test.csv');

    expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor);
    expect(mockAnchor.click).toHaveBeenCalledOnce();
    expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor);
  });

  it('calls revokeObjectURL to clean up the blob URL', () => {
    exportToCsv(rows, 'test.csv');

    expect(revokeObjectURL).toHaveBeenCalledWith(MOCK_URL);
  });
});
