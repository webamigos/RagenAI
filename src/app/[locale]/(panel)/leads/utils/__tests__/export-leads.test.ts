import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildRows,
  leadsToCsv,
  leadsToXlsx,
  sanitizeFilename,
  type ExportableColumn,
} from '../export-leads';
import { LeadEnrichmentStatus } from '@/generated/prisma/enums';
import type { LeadDto } from '@/features/leads/contracts/lead-list.types';

const baseLead = (data: Record<string, unknown>, i = 0): LeadDto => ({
  id: i,
  publicId: `pid-${i}`,
  rowIndex: i,
  data,
  enrichmentStatus: LeadEnrichmentStatus.idle,
  enrichedAt: null,
  enrichmentError: null,
  // scoring fields present on LeadDto since the scoring branch merge
  scoringStatus: 'idle' as LeadDto['scoringStatus'],
  scoringError: null,
  scoredAt: null,
});

const columns: ExportableColumn[] = [
  { key: 'name', label: 'Name', type: 'string' },
  { key: 'revenue', label: 'Revenue', type: 'number' },
  { key: 'active', label: 'Active', type: 'boolean' },
];

describe('export-leads / buildRows', () => {
  it('maps each column key to its typed scalar value', () => {
    const rows = buildRows(columns, [
      baseLead({ name: 'Acme', revenue: 100, active: true }),
      baseLead({ name: 'Beta', revenue: '200', active: 0 }, 1),
    ]);
    expect(rows).toEqual([
      ['Acme', 100, true],
      ['Beta', 200, false],
    ]);
  });

  it('returns null for empty / nullish / NaN values per type', () => {
    const rows = buildRows(columns, [
      baseLead({ name: '', revenue: 'not-a-number', active: null }),
      baseLead({ name: null, revenue: undefined, active: '' }, 1),
    ]);
    expect(rows).toEqual([
      [null, null, null],
      [null, null, null],
    ]);
  });
});

describe('export-leads / leadsToCsv', () => {
  it('emits UTF-8 BOM, CRLF line endings, and quoted/escaped values', () => {
    const csv = leadsToCsv(columns, [
      baseLead({ name: 'A, "Inc"', revenue: 1234, active: true }),
      baseLead({ name: 'Multi\nline', revenue: null, active: false }, 1),
    ]);
    const lines = csv.split('\r\n');
    expect(csv.startsWith('﻿')).toBe(true); // BOM
    expect(lines[0]).toBe('﻿Name,Revenue,Active');
    expect(lines[1]).toBe('"A, ""Inc""",1234,yes');
    expect(lines[2]).toBe('"Multi\nline",,no');
  });

  it('handles an empty list (header-only output)', () => {
    const csv = leadsToCsv(columns, []);
    expect(csv).toBe('﻿Name,Revenue,Active');
  });
});

describe('export-leads / leadsToXlsx', () => {
  it('produces an XLSX buffer the SheetJS reader can parse back', () => {
    const buffer = leadsToXlsx(
      columns,
      [baseLead({ name: 'Acme', revenue: 100, active: true })],
      'My List',
    );
    expect(buffer.byteLength).toBeGreaterThan(0);
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    expect(wb.SheetNames).toContain('My List');
    const sheet = wb.Sheets['My List'];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    expect(aoa[0]).toEqual(['Name', 'Revenue', 'Active']);
    expect(aoa[1]).toEqual(['Acme', 100, true]);
  });

  it('strips XLSX-illegal chars from the sheet name and caps at 31 chars', () => {
    const buffer = leadsToXlsx(
      columns,
      [],
      'A:Very*Long/Sheet[Name]??' + 'x'.repeat(80),
    );
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const safe = wb.SheetNames[0];
    expect(safe.length).toBeLessThanOrEqual(31);
    expect(safe).not.toMatch(/[\[\]:*?/\\]/);
  });

  it('falls back to "Sheet1" when sanitization wipes the name', () => {
    const buffer = leadsToXlsx(columns, [], '???/\\');
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    expect(wb.SheetNames[0]).toBe('Sheet1');
  });
});

describe('export-leads / sanitizeFilename', () => {
  it('replaces unsafe runs with underscore and trims leading/trailing', () => {
    // Trailing exclamation collapses into a trailing '_' which is then
    // stripped by the final ^_+|_+$ trim.
    expect(sanitizeFilename('My List 2026!')).toBe('My_List_2026');
    expect(sanitizeFilename('  weird  ?? name  ')).toBe('weird_name');
  });

  it('falls back to "leads" when input is entirely unsafe', () => {
    expect(sanitizeFilename('!!!???')).toBe('leads');
    expect(sanitizeFilename('')).toBe('leads');
  });

  it('keeps allowed characters intact', () => {
    expect(sanitizeFilename('InfoShare-2026_v.1')).toBe('InfoShare-2026_v.1');
  });
});
