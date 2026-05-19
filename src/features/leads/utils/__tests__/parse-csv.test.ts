import { describe, it, expect } from 'vitest';
import { LimitExceededException } from '@/libs/utils/errors';
import { parseLeadsCsv, MAX_CSV_ROWS } from '../parse-csv';

describe('parseLeadsCsv', () => {
  it('infers column keys, labels, and types from headers and samples', () => {
    const csv = [
      'Name,Company,Revenue,Active,Site',
      'Alice,Acme,12345,true,https://acme.example',
      'Bob,Beta,67890,false,https://beta.example',
    ].join('\n');

    const { columns, rows } = parseLeadsCsv(csv);

    expect(columns.map((c) => c.key)).toEqual([
      'name',
      'company',
      'revenue',
      'active',
      'site',
    ]);
    expect(columns.map((c) => c.label)).toEqual([
      'Name',
      'Company',
      'Revenue',
      'Active',
      'Site',
    ]);
    expect(columns.map((c) => c.type)).toEqual([
      'string',
      'string',
      'number',
      'boolean',
      'url',
    ]);
    expect(columns.every((c) => c.source === 'csv')).toBe(true);

    expect(rows[0]).toEqual({
      name: 'Alice',
      company: 'Acme',
      revenue: 12345,
      active: true,
      site: 'https://acme.example',
    });
  });

  it('deduplicates collided slug keys from different labels', () => {
    const csv = ['First Name,First-Name\nA,B'].join('\n');
    const { columns } = parseLeadsCsv(csv);
    expect(columns.map((c) => c.key)).toEqual(['first_name', 'first_name_2']);
  });

  it('returns empty result on empty input', () => {
    expect(parseLeadsCsv('')).toEqual({ columns: [], rows: [] });
  });

  it('throws LimitExceededException when row count exceeds MAX_CSV_ROWS', () => {
    const header = 'Name\n';
    const rows = Array.from(
      { length: MAX_CSV_ROWS + 1 },
      (_, i) => `Row${i}`,
    ).join('\n');
    expect(() => parseLeadsCsv(header + rows)).toThrow(LimitExceededException);
  });

  it('coerces empty cells to null', () => {
    const csv = ['Name,Age\nAlice,', 'Bob,30'].join('\n');
    const { rows } = parseLeadsCsv(csv);
    expect(rows[0].age).toBeNull();
    expect(rows[1].age).toBe(30);
  });

  it('handles UTF-8 BOM and Polish characters', () => {
    const csv = '﻿Imię,Miasto\nŻaneta,Łódź\n';
    const { columns, rows } = parseLeadsCsv(csv);
    expect(columns.map((c) => c.label)).toEqual(['Imię', 'Miasto']);
    expect(rows[0]).toMatchObject({ imie: 'Żaneta', miasto: 'Łódź' });
  });

  it('infers date type for ISO YYYY-MM-DD columns', () => {
    const csv = 'Name,Founded\nAcme,2020-01-15\nBeta,2019-06-30\n';
    const { columns, rows } = parseLeadsCsv(csv);
    expect(columns.find((c) => c.key === 'founded')?.type).toBe('date');
    expect(rows[0].founded).toBe('2020-01-15T00:00:00.000Z');
  });

  it('infers date type for European DD.MM.YYYY columns', () => {
    const csv = 'Name,Founded\nAcme,15.01.2020\nBeta,30.06.2019\n';
    const { columns, rows } = parseLeadsCsv(csv);
    expect(columns.find((c) => c.key === 'founded')?.type).toBe('date');
  });

  it('infers date type for US MM/DD/YYYY columns', () => {
    const csv = 'Name,Founded\nAcme,01/15/2020\nBeta,06/30/2019\n';
    const { columns, rows } = parseLeadsCsv(csv);
    expect(columns.find((c) => c.key === 'founded')?.type).toBe('date');
  });

  it('falls back to string when date column has mixed values', () => {
    const csv = 'Name,Founded\nAcme,2020-01-15\nBeta,not-a-date\n';
    const { columns } = parseLeadsCsv(csv);
    expect(columns.find((c) => c.key === 'founded')?.type).toBe('string');
  });

  it('coerces invalid date to original string as fallback', () => {
    // Mixed column (valid + invalid) is inferred as string; coerce returns value unchanged.
    const csv = 'Name,Founded\nAcme,not-a-date\nBeta,2019-06-30\n';
    const { rows } = parseLeadsCsv(csv);
    expect(typeof rows[0].founded).toBe('string');
    expect(rows[0].founded).toBe('not-a-date');
  });
});
