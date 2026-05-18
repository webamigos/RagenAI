import { parse } from 'csv-parse/sync';
import type { CsvImportResult } from '../contracts/lead-list.types';
import type { LeadColumn, LeadColumnType } from '../contracts/lead-column.types';

const URL_RE = /^https?:\/\/\S+$/i;

function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'col'
  );
}

function dedupeKey(key: string, used: Set<string>): string {
  if (!used.has(key)) {
    used.add(key);
    return key;
  }
  let i = 2;
  while (used.has(`${key}_${i}`)) {
    i += 1;
  }
  const next = `${key}_${i}`;
  used.add(next);
  return next;
}

function inferType(samples: string[]): LeadColumnType {
  const nonEmpty = samples.filter((s) => s !== '' && s != null);
  if (nonEmpty.length === 0) {
    return 'string';
  }
  if (nonEmpty.every((s) => URL_RE.test(s))) {
    return 'url';
  }
  if (nonEmpty.every((s) => /^-?\d+(\.\d+)?$/.test(s))) {
    return 'number';
  }
  if (nonEmpty.every((s) => /^(true|false|tak|nie|yes|no)$/i.test(s))) {
    return 'boolean';
  }
  return 'string';
}

function coerce(value: string, type: LeadColumnType): unknown {
  if (value === '' || value == null) {
    return null;
  }
  switch (type) {
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean':
      return /^(true|tak|yes)$/i.test(value);
    default:
      return value;
  }
}

export function parseLeadsCsv(content: string | Buffer): CsvImportResult {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as Array<Record<string, string>>;

  if (records.length === 0) {
    return { columns: [], rows: [] };
  }

  const headers = Object.keys(records[0] ?? {});
  const usedKeys = new Set<string>();
  const columns: LeadColumn[] = headers.map((label) => {
    const baseKey = slugify(label);
    const key = dedupeKey(baseKey, usedKeys);
    const samples = records.slice(0, 50).map((r) => r[label] ?? '');
    return {
      key,
      label,
      type: inferType(samples),
      source: 'csv',
    };
  });

  const rows = records.map((record) => {
    const out: Record<string, unknown> = {};
    columns.forEach((col, idx) => {
      const raw = record[headers[idx]] ?? '';
      out[col.key] = coerce(raw, col.type);
    });
    return out;
  });

  return { columns, rows };
}
