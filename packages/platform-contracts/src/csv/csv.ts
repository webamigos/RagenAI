/**
 * CSV serialisation, with the formula-injection defence that makes it safe to
 * open the result in a spreadsheet.
 *
 * There were two implementations of this. `apps/web/src/app/lib/utils/csv.ts`
 * prefixed cells beginning `=`, `+`, `-` or `@` with an apostrophe; the
 * server-side route at `apps/web/src/app/api/organization/teams/[teamId]/usage-csv/`
 * quoted per RFC 4180 and **did not** neutralise formulas — and that is the one
 * producing a downloadable file. A cell reaching Excel as `=HYPERLINK(...)` or
 * `=cmd|...` is executed by the spreadsheet, not by us, which is why the
 * defence belongs at the point of writing rather than the point of display.
 *
 * Shared for the same reason the audit redaction is (ADR-33): a third copy
 * would have been a third chance to forget the half that matters.
 */

/** Leading characters a spreadsheet treats as the start of a formula. */
const FORMULA_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * One cell: neutralise a leading formula character, then quote per RFC 4180.
 *
 * The apostrophe is prepended *before* quoting so it lands inside the quotes
 * and survives the round trip.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  let str = String(value);
  if (str.length > 0 && FORMULA_CHARS.has(str[0])) {
    str = `'${str}`;
  }
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Rows to a CSV document, taking the column order from an explicit header list
 * so a row with a missing key still lines up.
 *
 * Passing `headers` explicitly matters for anything derived from a database:
 * inferring them from `rows[0]` silently drops a column whose first row happens
 * to be null.
 */
export function buildCsvString(
  rows: Record<string, unknown>[],
  headers?: string[],
): string {
  const columns = headers ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
  if (columns.length === 0) {
    return '';
  }
  const headerRow = columns.map(escapeCsvCell).join(',');
  const dataRows = rows.map((row) =>
    columns.map((column) => escapeCsvCell(row[column])).join(','),
  );
  return [headerRow, ...dataRows].join('\n');
}

/**
 * A filename safe to put in a `Content-Disposition` header.
 *
 * Quotes and newlines in that header are a response-splitting problem, and the
 * value here is often built from a name a customer chose.
 */
export function safeCsvFilename(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = cleaned.length > 0 ? cleaned : 'export';
  return base.endsWith('.csv') ? base : `${base}.csv`;
}

/** The headers every CSV download in this monorepo should carry. */
export function csvDownloadHeaders(filename: string): Record<string, string> {
  return {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${safeCsvFilename(filename)}"`,
    // These exports contain customer data; a shared cache must not keep them.
    'cache-control': 'no-store',
  };
}
