/**
 * Browser-side CSV download.
 *
 * The serialisation and the formula-injection defence live in
 * `@ragenai/platform-contracts` (ADR-33), because the server-side export route
 * beside this had its own escaper that quoted per RFC 4180 but did **not**
 * neutralise formulas — and that is the one producing a downloadable file.
 * Only the DOM part is local.
 */
import { buildCsvString } from '@ragenai/platform-contracts';

export { buildCsvString };

export function exportToCsv(
  rows: Record<string, unknown>[],
  filename: string,
): void {
  const csv = buildCsvString(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
