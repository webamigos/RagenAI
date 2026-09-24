'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { WorkBook, WorkSheet } from 'xlsx';

import { cn } from '@/lib/utils';

import { findMatchingRows } from '../passage/find-passage';
import { scrollPassageIntoView } from '../passage/highlight-in-element';
import { PassageNotFoundHint } from '../passage/PassageNotFoundHint';

/**
 * The most rows a sheet renders.
 *
 * A 50,000-row sheet as one `<table>` locks the tab, and a preview is for
 * seeing what was uploaded, not for reading all of it — the download link is
 * one click away. The cap is also passed to SheetJS as `sheetRows`, so the
 * rows past it are never turned into cells at all, and the UI says when it
 * applied.
 */
export const XLSX_PREVIEW_MAX_ROWS = 1000;

type Props = {
  contentUrl: string;
  /**
   * Rows rendered per sheet. Production always uses the default; the prop
   * exists so a test can prove the cap without rendering a thousand rows,
   * which under coverage outran the suite's 5 s timeout in CI.
   */
  maxRows?: number;
  /**
   * The passage a citation quoted — a chunk of rows, as CSV lines or Markdown
   * table rows. The viewer opens on the sheet that holds them and marks them.
   */
  passage?: string;
};

/** Where a quoted chunk of rows sits in a workbook. */
type CitedRows = {
  sheetIndex: number;
  /** Indices into the parsed sheet's `rows`. */
  rows: Set<number>;
  /**
   * The row to scroll to: the first match that is not the sheet's first row,
   * when there is one. Every spreadsheet chunk repeats the header, so the
   * header always matches, and scrolling to it would be scrolling to the top.
   */
  scrollRow: number;
};

type ParsedSheet = {
  /** Column letters for the header row, e.g. `['A', 'B', 'C']`. */
  columns: string[];
  /** Spreadsheet row numbers, 1-based, one per rendered row. */
  rowNumbers: number[];
  rows: string[][];
  /** Rows the sheet really has, which may be more than were rendered. */
  totalRows: number;
};

type SheetJs = typeof import('xlsx');

/**
 * One sheet as rows of display strings.
 *
 * `sheet_to_json`, not `sheet_to_html`: this builds the table from values, so
 * nothing from the file is ever set as markup and no sanitiser is needed.
 * `raw: false` takes each cell's formatted text — a date reads as a date, not
 * as a serial number — which is what the user sees in their spreadsheet app.
 */
function parseSheet(
  XLSX: SheetJs,
  sheet: WorkSheet | undefined,
  maxRows: number,
): ParsedSheet {
  const ref = sheet?.['!ref'];
  if (!sheet || !ref) {
    return { columns: [], rowNumbers: [], rows: [], totalRows: 0 };
  }

  const range = XLSX.utils.decode_range(ref);
  // With `sheetRows`, `!ref` is the truncated range and `!fullref` the real one.
  const fullRange = XLSX.utils.decode_range(sheet['!fullref'] ?? ref);

  const rows = XLSX.utils
    .sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
    })
    .slice(0, maxRows)
    .map((row) => row.map((cell) => (cell == null ? '' : String(cell))));

  const columns: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    columns.push(XLSX.utils.encode_col(c));
  }

  return {
    columns,
    rowNumbers: rows.map((_, i) => range.s.r + i + 1),
    rows,
    totalRows: fullRange.e.r - fullRange.s.r + 1,
  };
}

/**
 * Finds the sheet a snippet came from and the rows it quoted.
 *
 * Every sheet is searched, and the one with the most matching rows wins. The
 * chunk's `sheet_name` is not on the retrieved source, and does not need to
 * be: the rows identify the sheet, and a sheet renamed since ingest would have
 * sent a name lookup to the wrong place.
 */
function locateRows(
  XLSX: SheetJs,
  workbook: WorkBook,
  passage: string,
  maxRows: number,
): CitedRows | null {
  let best: CitedRows | null = null;
  workbook.SheetNames.forEach((name, sheetIndex) => {
    const { rows } = parseSheet(XLSX, workbook.Sheets[name], maxRows);
    const matched = findMatchingRows(rows, passage);
    if (matched.length === 0 || (best && best.rows.size >= matched.length)) {
      return;
    }
    best = {
      sheetIndex,
      rows: new Set(matched),
      scrollRow: matched.find((row) => row > 0) ?? matched[0],
    };
  });
  return best;
}

export function XlsxViewer({
  contentUrl,
  maxRows = XLSX_PREVIEW_MAX_ROWS,
  passage,
}: Props) {
  const t = useTranslations('document-preview');
  // Every result is tagged with the URL it came from, and anything tagged with
  // another URL reads as not loaded yet. That is how a new file resets the
  // view without an effect clearing state by hand — and why a slow response
  // for the previous file can never be shown for this one.
  const [result, setResult] = useState<
    | { url: string; XLSX: SheetJs; workbook: WorkBook }
    | { url: string; error: true }
    | null
  >(null);
  // Starts as "nothing chosen" — an empty url matches no file — so the sheet
  // shown first is the cited one, and becomes the reader's choice only once
  // they click a tab.
  const [selected, setSelected] = useState<{ url: string; index: number }>({
    url: '',
    index: 0,
  });

  useEffect(() => {
    if (!contentUrl) {
      return;
    }
    let cancelled = false;

    // SheetJS is loaded here rather than at the top of the file: the knowledge
    // base imports every viewer statically, and a reader who never opens a
    // spreadsheet should not download a spreadsheet parser.
    Promise.all([
      import('xlsx'),
      fetch(contentUrl).then((res) => {
        if (!res.ok) {
          throw new Error('fetch failed');
        }
        return res.arrayBuffer();
      }),
    ])
      .then(([XLSX, buffer]) => {
        const workbook = XLSX.read(new Uint8Array(buffer), {
          type: 'array',
          sheetRows: maxRows,
        });
        if (!cancelled) {
          setResult({ url: contentUrl, XLSX, workbook });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ url: contentUrl, error: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [contentUrl, maxRows]);

  const current = result?.url === contentUrl ? result : null;
  const loaded = current && 'workbook' in current ? current : null;
  const error = current !== null && 'error' in current;

  const cited = useMemo(
    () =>
      loaded && passage
        ? locateRows(loaded.XLSX, loaded.workbook, passage, maxRows)
        : null,
    [loaded, passage, maxRows],
  );

  // Until the reader picks a sheet, the one the citation came from is shown.
  const activeSheet =
    selected.url === contentUrl ? selected.index : (cited?.sheetIndex ?? 0);
  const setActiveSheet = (index: number) =>
    setSelected({ url: contentUrl, index });

  const sheetNames = loaded?.workbook.SheetNames ?? [];
  const sheetName = sheetNames[activeSheet];

  const citedRows = cited && cited.sheetIndex === activeSheet ? cited : null;

  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!citedRows) {
      return;
    }
    scrollPassageIntoView(
      tableRef.current?.querySelector('[data-cited-scroll]') ?? null,
    );
  }, [citedRows]);

  const sheet = useMemo(
    () =>
      loaded && sheetName
        ? parseSheet(loaded.XLSX, loaded.workbook.Sheets[sheetName], maxRows)
        : null,
    [loaded, sheetName, maxRows],
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-destructive">
        {t('error-loading')}
      </div>
    );
  }

  if (!loaded || !sheet) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        {t('loading')}
      </div>
    );
  }

  const truncated = sheet.totalRows > sheet.rows.length;
  // Said once, for the workbook: a passage found on another sheet than the
  // one the reader switched to is still found.
  const passageMissing = Boolean(passage) && cited === null;

  return (
    <div className="flex h-full flex-col">
      {sheetNames.length > 1 && (
        <div
          role="tablist"
          aria-label={t('xlsx-sheets')}
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted px-2 pt-2"
        >
          {sheetNames.map((name, index) => {
            const selected = index === activeSheet;
            return (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveSheet(index)}
                className={cn(
                  'shrink-0 rounded-t-md border border-b-0 px-3 py-1.5 text-xs whitespace-nowrap',
                  selected
                    ? 'border-border bg-background font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {passageMissing ? <PassageNotFoundHint /> : null}

      {truncated && (
        <p
          role="status"
          className="shrink-0 border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground"
        >
          {t('xlsx-truncated', {
            shown: sheet.rows.length,
            total: sheet.totalRows,
          })}
        </p>
      )}

      {sheet.rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          {t('xlsx-empty-sheet')}
        </div>
      ) : (
        <div ref={tableRef} className="min-h-0 flex-1 overflow-auto">
          <table className="border-separate border-spacing-0 text-xs text-foreground">
            <thead>
              <tr>
                {/* The corner cell above the row numbers. */}
                <th className="sticky top-0 left-0 z-20 border-r border-b border-border bg-muted" />
                {sheet.columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="sticky top-0 z-10 min-w-16 border-r border-b border-border bg-muted px-2 py-1 font-medium text-muted-foreground"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, rowIndex) => {
                const isCited = citedRows?.rows.has(rowIndex) ?? false;
                return (
                  <tr
                    key={sheet.rowNumbers[rowIndex]}
                    data-cited-row={isCited ? '' : undefined}
                    data-cited-scroll={
                      citedRows?.scrollRow === rowIndex ? '' : undefined
                    }
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-r border-b border-border bg-muted px-2 py-1 text-right font-medium text-muted-foreground"
                    >
                      {sheet.rowNumbers[rowIndex]}
                    </th>
                    {sheet.columns.map((column, columnIndex) => (
                      <td
                        key={column}
                        className={cn(
                          'max-w-80 truncate border-r border-b border-border px-2 py-1',
                          isCited
                            ? 'bg-highlight text-highlight-foreground'
                            : 'bg-background',
                        )}
                        title={row[columnIndex] || undefined}
                      >
                        {row[columnIndex] ?? ''}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
