/**
 * Spreadsheets, through the SheetJS build already hoisted at the repository
 * root — the same one `apps/worker` parses uploads with, and the same one the
 * RAG benchmark's `build-corpus.mjs` writes its corpus with.
 *
 * Two things here are not cosmetic.
 *
 * **No formulas.** The worker reads XLSX through SheetJS, which returns a
 * formula cell's *cached* value, and a writer that does not compute the formula
 * writes no cache. A `=SUM(...)` would therefore reach the index as an empty
 * cell and every question about a total would be unanswerable. Totals are
 * computed in `numbers.mjs` and written as numbers.
 *
 * **The group separator in a number format is `,`, always.** It is a
 * placeholder that Excel renders with the reader's own locale separator, so a
 * Polish Excel still shows `27 300 000 zł`. Writing `# ##0` instead — which
 * looks like the Polish convention and is what a first pass at this corpus
 * used — makes SheetJS render seven-digit figures as `27300 000 zł`, and since
 * SheetJS is what the ingest reads with, that mangled string is what lands in
 * the index. It is invisible in Excel and wrong in every answer.
 */

import XLSX from 'xlsx';

export const MONEY = { pl: '#,##0" zł"', en: '"PLN "#,##0' };
export const MONEY_DECIMAL = { pl: '#,##0.00" zł"', en: '"PLN "#,##0.00' };
export const PERCENT = { pl: '0.0%', en: '0.0%' };
export const INTEGER = { pl: '#,##0', en: '#,##0' };

export function newWorkbook() {
  return XLSX.utils.book_new();
}

/**
 * One sheet: a title block, a header row, then the rows.
 *
 * The title and subtitle are ordinary cells rather than anything structural.
 * A sheet reaches the index as CSV, where a heading and a first data row look
 * the same — so the subtitle is where a sheet says what its numbers mean, and
 * it is worth writing as a sentence.
 */
export function addSheet(workbook, name, { title, subtitle, headers, rows, widths, formats = {} }, locale) {
  const matrix = [];
  if (title) {
    matrix.push([title]);
  }
  if (subtitle) {
    matrix.push([subtitle]);
  }
  if (title || subtitle) {
    matrix.push([]);
  }
  const headerRow = matrix.length;
  matrix.push(headers);
  for (const row of rows) {
    matrix.push(row);
  }

  const sheet = XLSX.utils.aoa_to_sheet(matrix);

  for (const [column, format] of Object.entries(formats)) {
    for (let index = 0; index < rows.length; index += 1) {
      const address = XLSX.utils.encode_cell({ r: headerRow + 1 + index, c: Number(column) });
      const cell = sheet[address];
      if (cell && cell.t === 'n') {
        cell.z = typeof format === 'string' ? format : format[locale];
      }
    }
  }

  if (widths) {
    sheet['!cols'] = widths.map((width) => ({ wch: width }));
  }

  XLSX.utils.book_append_sheet(workbook, sheet, name);
  return sheet;
}

export function save(workbook, path) {
  XLSX.writeFile(workbook, path);
}
