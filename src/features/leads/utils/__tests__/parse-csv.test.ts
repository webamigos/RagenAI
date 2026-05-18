import { describe, it, expect } from 'vitest';
import { parseLeadsCsv } from '../parse-csv';

describe('parseLeadsCsv', () => {
  it('infers column keys, labels, and types from headers and samples', () => {
    const csv = [
      'Name,Company,Revenue,Active,Site',
      'Alice,Acme,12345,true,https://acme.example',
      'Bob,Beta,67890,false,https://beta.example',
    ].join('\n');

    const { columns, rows } = parseLeadsCsv(csv);

    expect(columns.map((c) => c.key)).toEqual(['name', 'company', 'revenue', 'active', 'site']);
    expect(columns.map((c) => c.label)).toEqual(['Name', 'Company', 'Revenue', 'Active', 'Site']);
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
});
