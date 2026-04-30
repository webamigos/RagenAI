import { describe, it, expect } from 'vitest';
import { buildCsvString } from '../csv';

describe('buildCsvString', () => {
  it('returns empty string for empty rows', () => {
    expect(buildCsvString([])).toBe('');
  });

  it('generates header row from object keys', () => {
    const result = buildCsvString([{ name: 'Alice', age: 30 }]);
    const lines = result.split('\n');
    expect(lines[0]).toBe('name,age');
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
