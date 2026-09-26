import { cn } from '@/lib/utils';
import { isNumericCell, type SnippetTable } from './snippet-table';

/**
 * The width cap lives on a block inside the cell, not on the cell: browsers
 * ignore `max-width` on a table cell in automatic layout.
 */
const Cell = ({ text }: { text: string }) => (
  <span title={text} className="block max-w-40 truncate">
    {text}
  </span>
);

/**
 * A tabular passage on a source card: the caption, the column names when the
 * source marked them, and the first few rows.
 *
 * Compact on purpose — it sits where a three-line quote sits, so it keeps the
 * quote's 11px muted type and left rule, scrolls sideways rather than
 * wrapping a wide sheet, and cuts each cell to a width with the whole value in
 * `title`. Numbers sit right-aligned in tabular numerals, the way the panel's
 * own tables set them, so a column of figures can be read down.
 */
export const SourceSnippetTable = ({ table }: { table: SnippetTable }) => (
  <div className="mt-1 border-l-2 border-border pl-2 text-[11px] leading-snug text-muted-foreground">
    {table.caption ? <p className="truncate">{table.caption}</p> : null}
    <div className="overflow-x-auto">
      <table className="border-collapse tabular-nums">
        {table.header ? (
          <thead>
            <tr>
              {table.header.map((cell, i) => (
                <th
                  key={i}
                  scope="col"
                  className="border-b border-border px-1.5 py-0.5 text-left font-medium text-foreground first:pl-0"
                >
                  <Cell text={cell} />
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    'px-1.5 py-0.5 first:pl-0',
                    isNumericCell(cell) ? 'text-right' : 'text-left',
                  )}
                >
                  <Cell text={cell} />
                </td>
              ))}
            </tr>
          ))}
          {/*
            The passage had more rows than a card shows. An ellipsis rather
            than a count: the snippet is itself capped on the server, so any
            number here would be a count of what was quoted, not of the sheet.
          */}
          {table.hasMoreRows ? (
            <tr aria-hidden="true" data-testid="snippet-table-more">
              <td className="px-1.5 first:pl-0">…</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  </div>
);
