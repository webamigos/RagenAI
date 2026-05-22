import * as XLSX from 'xlsx';
import type { LeadColumn } from '@/features/leads/contracts/lead-column.types';
import type { LeadDto } from '@/features/leads/contracts/lead-list.types';

export type ExportableColumn = Pick<LeadColumn, 'key' | 'label' | 'type'>;

function cellValue(
  value: unknown,
  type: LeadColumn['type'],
): string | number | boolean | null {
  if (value == null || value === '') {
    return null;
  }
  if (type === 'boolean') {
    return Boolean(value);
  }
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return String(value);
}

function escapeCsv(value: string | number | boolean | null): string {
  if (value === null) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildRows(
  columns: ExportableColumn[],
  leads: LeadDto[],
): (string | number | boolean | null)[][] {
  return leads.map((lead) =>
    columns.map((c) => cellValue(lead.data[c.key], c.type)),
  );
}

export function leadsToCsv(
  columns: ExportableColumn[],
  leads: LeadDto[],
): string {
  const header = columns.map((c) => escapeCsv(c.label)).join(',');
  const lines = buildRows(columns, leads).map((row) =>
    row.map(escapeCsv).join(','),
  );
  // UTF-8 BOM so Excel opens the file with correct encoding.
  return `﻿${[header, ...lines].join('\r\n')}`;
}

export function leadsToXlsx(
  columns: ExportableColumn[],
  leads: LeadDto[],
  sheetName: string,
): ArrayBuffer {
  const header = columns.map((c) => c.label);
  const data = buildRows(columns, leads);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  // Freeze header row.
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  sheet['!cols'] = columns.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  // XLSX sheet names are capped at 31 chars and disallow []:*?/\.
  const safeName =
    sheetName.replace(/[[\]:*?/\\]/g, '').slice(0, 31) || 'Sheet1';
  XLSX.utils.book_append_sheet(wb, sheet, safeName);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function sanitizeFilename(name: string): string {
  return (
    name.replace(/[^a-zA-Z0-9\-_.]+/g, '_').replace(/^_+|_+$/g, '') || 'leads'
  );
}
