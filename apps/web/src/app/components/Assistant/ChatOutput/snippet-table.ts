import { snippetToPlainText } from './snippet-text';

/**
 * A retrieved passage that is a table, in the shape a source card can draw.
 *
 * A spreadsheet chunk is rows of figures, and `snippetToPlainText` — right for
 * prose — turns them into one run of numbers joined by dots, which no reader
 * can map back to a column. When the passage is recognisably a table this
 * reads it as one instead, so the card can show a few rows under their column
 * names.
 *
 * Two shapes are recognised:
 *
 * - **Markdown pipe tables**, from any file. Docling writes every table this
 *   way, and ADR-43's table chunks do too — an optional `[Table 1: …]` caption
 *   line, then `| a | b |` rows, with a `| --- |` separator only when Docling
 *   flagged a header. The shape is unambiguous, so it is trusted wherever it
 *   appears.
 * - **CSV lines**, only from a file whose name says it is a spreadsheet. The
 *   fallback loaders index a sheet as SheetJS CSV, and ADR-17's row-group
 *   splitter repeats the header at the top of each chunk. Comma-separated
 *   lines are also what an ordinary sentence list looks like, so the file name
 *   is required before a comma is read as a column boundary.
 *
 * Anything else — prose around a table, a table flattened onto one line, rows
 * that disagree about their width in a CSV — returns `null`, and the card
 * falls back to the plain-text quote it has always shown. A wrong table is
 * worse than no table: it asserts columns that are not there.
 *
 * Display only, like `snippetToPlainText`: the stored snippet is untouched.
 */
export type SnippetTable = {
  /** The line above the table — a sheet name or ADR-43's `[Table n: …]`. */
  caption: string | null;
  /** Column names, only when the source marked them as such. */
  header: string[] | null;
  /** The first rows, at most `maxRows`, each as wide as the widest row. */
  rows: string[][];
  /** Whether the passage held rows beyond the ones returned. */
  hasMoreRows: boolean;
};

/** Rows a source card shows. A quote, not the sheet: the preview has the rest. */
export const SNIPPET_TABLE_MAX_ROWS = 4;

const SPREADSHEET_EXTENSIONS = /\.(csv|tsv|xlsx|xlsm|xls|ods)$/i;

/** A markdown separator row: `| --- | :---: |`, dashes at least one per cell. */
const SEPARATOR_ROW = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

/**
 * One markdown table line as its cells. Escape-aware, like the worker's
 * `cellsOf` in `table-chunks.ts` that wrote it: `\|` is a pipe inside a cell.
 */
function pipeCells(line: string): string[] {
  const withoutEdges = line
    .trim()
    .replace(/^\|/, '')
    .replace(/(^|[^\\])\|$/, '$1');
  return withoutEdges.split(/(?<!\\)\|/).map((cell) =>
    cell
      .replace(/\\\|/g, '|')
      // The worker writes a newline inside a cell as `<br>`.
      .replace(/<br\s*\/?>/gi, ' ')
      .trim(),
  );
}

/** A row line is complete when it ends on a pipe that is not escaped. */
function isCompletePipeRow(line: string): boolean {
  return /(^|[^\\])\|$/.test(line);
}

function parsePipeTable(lines: string[]): {
  caption: string | null;
  header: string[] | null;
  rows: string[][];
  truncated: boolean;
} | null {
  let start = 0;
  let caption: string | null = null;

  // At most one line above the table, and only one that cannot be a row cut
  // in half: a chunk that starts mid-row begins with cells and a pipe.
  if (!lines[0].startsWith('|')) {
    if (lines[0].includes('|')) {
      start = 1;
    } else {
      caption = snippetToPlainText(lines[0]) || null;
      start = 1;
    }
  }

  const tableLines = lines.slice(start);
  if (tableLines.length === 0 || !tableLines.every((l) => l.startsWith('|'))) {
    return null;
  }

  // The snippet is capped on the server, so its last row can be cut short.
  let truncated = false;
  if (!isCompletePipeRow(tableLines[tableLines.length - 1])) {
    tableLines.pop();
    truncated = true;
  }

  let header: string[] | null = null;
  let body = tableLines;
  if (tableLines.length >= 2 && SEPARATOR_ROW.test(tableLines[1])) {
    header = pipeCells(tableLines[0]);
    body = tableLines.slice(2);
  }
  // A separator anywhere else is not a header marker this can place.
  if (body.some((l) => SEPARATOR_ROW.test(l))) {
    return null;
  }

  const rows = body.map(pipeCells);
  // Two rows at least without a header, so one stray pipe line is not a table.
  if (rows.length === 0 || (header === null && rows.length < 2)) {
    return null;
  }
  return { caption, header, rows, truncated };
}

/**
 * One CSV line as its fields: RFC 4180 quoting, a doubled quote inside a
 * quoted field. `null` when a quote is left open — a field spanning lines,
 * which a line-at-a-time reader cannot place.
 */
function csvFields(line: string, delimiter: string): string[] | null {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (char === delimiter) {
      fields.push(field.trim());
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) {
    return null;
  }
  fields.push(field.trim());
  return fields;
}

function parseCsvTable(lines: string[]): {
  header: string[];
  rows: string[][];
  truncated: boolean;
} | null {
  for (const delimiter of [',', ';', '\t']) {
    const parsed = lines.map((line) => csvFields(line, delimiter));
    let truncated = false;
    // The last line may be cut by the server's cap; judge the rest.
    const width = parsed[0]?.length ?? 0;
    const last = parsed[parsed.length - 1];
    if (parsed.length > 2 && (last === null || last.length !== width)) {
      parsed.pop();
      truncated = true;
    }
    // Every line the same width, and at least two columns. SheetJS pads a
    // sheet's rows to one width, so a mismatch means this is not its output
    // (or not this delimiter).
    if (
      width < 2 ||
      parsed.length < 2 ||
      !parsed.every((fields) => fields !== null && fields.length === width)
    ) {
      continue;
    }
    const [header, ...rows] = parsed as string[][];
    return { header, rows, truncated };
  }
  return null;
}

/** Pads every row to the widest and drops columns that are empty throughout. */
function normalise(header: string[] | null, rows: string[][]) {
  const width = Math.max(header?.length ?? 0, ...rows.map((r) => r.length));
  const pad = (row: string[]) =>
    Array.from({ length: width }, (_, i) => row[i] ?? '');
  const paddedHeader = header ? pad(header) : null;
  const paddedRows = rows.map(pad);
  const keep = Array.from({ length: width }, (_, i) => i).filter(
    (i) =>
      (paddedHeader?.[i] ?? '') !== '' || paddedRows.some((r) => r[i] !== ''),
  );
  const pick = (row: string[]) => keep.map((i) => row[i]);
  return {
    header: paddedHeader ? pick(paddedHeader) : null,
    rows: paddedRows.map(pick),
    width: keep.length,
  };
}

/**
 * The passage as a table, or `null` when it is not one this can read with
 * confidence. `fileName` gates the CSV reading; a pipe table needs no name.
 */
export function parseSnippetTable(
  snippet: string,
  fileName?: string | null,
  maxRows = SNIPPET_TABLE_MAX_ROWS,
): SnippetTable | null {
  const lines = snippet
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    return null;
  }

  let parsed: {
    caption: string | null;
    header: string[] | null;
    rows: string[][];
    truncated: boolean;
  } | null = null;

  if (lines.some((line) => line.startsWith('|'))) {
    parsed = parsePipeTable(lines);
  } else if (fileName && SPREADSHEET_EXTENSIONS.test(fileName)) {
    const csv = parseCsvTable(lines);
    parsed = csv ? { caption: null, ...csv } : null;
  }
  if (!parsed) {
    return null;
  }

  const { header, rows, width } = normalise(parsed.header, parsed.rows);
  if (width < 2 || rows.length === 0) {
    return null;
  }
  return {
    caption: parsed.caption,
    header,
    rows: rows.slice(0, maxRows),
    hasMoreRows: parsed.truncated || rows.length > maxRows,
  };
}

/** Whether a cell reads as a number, so it can sit right-aligned. */
export function isNumericCell(cell: string): boolean {
  return /^[-+]?[\d\s.,]*\d[\d\s.,]*\s?%?$/.test(cell) && cell.length <= 24;
}
