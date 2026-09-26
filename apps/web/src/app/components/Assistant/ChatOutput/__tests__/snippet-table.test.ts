import { describe, expect, it } from 'vitest';

import { isNumericCell, parseSnippetTable } from '../snippet-table';

describe('parseSnippetTable', () => {
  describe('markdown pipe tables', () => {
    it('reads an ADR-43 table chunk: caption, header, rows', () => {
      const snippet = [
        '[Table 1: Sales 2024]',
        '| Region | Q1 | Q2 |',
        '| --- | --- | --- |',
        '| North | 1 200 | 1 350 |',
        '| South | 980 | 1 010 |',
      ].join('\n');

      expect(parseSnippetTable(snippet, 'sales.xlsx')).toEqual({
        caption: '[Table 1: Sales 2024]',
        header: ['Region', 'Q1', 'Q2'],
        rows: [
          ['North', '1 200', '1 350'],
          ['South', '980', '1 010'],
        ],
        hasMoreRows: false,
      });
    });

    it('reads a pipe table from any file, not only a spreadsheet', () => {
      const snippet = '| a | b |\n|---|---|\n| 1 | 2 |';
      expect(parseSnippetTable(snippet, 'report.pdf')?.header).toEqual([
        'a',
        'b',
      ]);
      expect(parseSnippetTable(snippet, null)?.rows).toEqual([['1', '2']]);
    });

    it('invents no header when the table has no separator row', () => {
      // ADR-43: repeating an arbitrary first row reads as authoritative.
      const table = parseSnippetTable('| 1 | 2 |\n| 3 | 4 |', 'a.xlsx');
      expect(table?.header).toBeNull();
      expect(table?.rows).toEqual([
        ['1', '2'],
        ['3', '4'],
      ]);
    });

    it('pads ragged rows to the widest', () => {
      const table = parseSnippetTable(
        '| a | b | c |\n| --- | --- | --- |\n| 1 |\n| 2 | 3 | 4 | 5 |',
      );
      expect(table?.header).toEqual(['a', 'b', 'c', '']);
      expect(table?.rows).toEqual([
        ['1', '', '', ''],
        ['2', '3', '4', '5'],
      ]);
    });

    it('keeps an escaped pipe inside its cell', () => {
      const table = parseSnippetTable(
        '| rule | value |\n| --- | --- |\n| a \\| b | 1 |\n| c | 2 \\| 3 |',
      );
      expect(table?.rows).toEqual([
        ['a | b', '1'],
        ['c', '2 | 3'],
      ]);
    });

    it('reads the worker’s <br> as a space', () => {
      const table = parseSnippetTable(
        '| a | b |\n| line one<br>line two | 2 |',
      );
      expect(table?.rows[1]).toEqual(['line one line two', '2']);
    });

    it('drops columns that are empty throughout', () => {
      const table = parseSnippetTable('| a | | b |\n| 1 | | 2 |');
      expect(table?.rows).toEqual([
        ['a', 'b'],
        ['1', '2'],
      ]);
    });

    it('shows the first rows and says there are more', () => {
      const rows = Array.from({ length: 9 }, (_, i) => `| r${i} | ${i} |`);
      const table = parseSnippetTable(
        ['| name | n |', '| --- | --- |', ...rows].join('\n'),
      );
      expect(table?.rows).toHaveLength(4);
      expect(table?.rows[3]).toEqual(['r3', '3']);
      expect(table?.hasMoreRows).toBe(true);
    });

    it('drops a last row the server cap cut in half', () => {
      const table = parseSnippetTable(
        '| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4',
      );
      expect(table?.rows).toEqual([['1', '2']]);
      expect(table?.hasMoreRows).toBe(true);
    });

    it('drops a first row the chunker cut in half instead of calling it a caption', () => {
      const table = parseSnippetTable('4 | 5 |\n| 6 | 7 |\n| 8 | 9 |');
      expect(table?.caption).toBeNull();
      expect(table?.rows).toEqual([
        ['6', '7'],
        ['8', '9'],
      ]);
    });

    it('strips Markdown from a heading caption', () => {
      expect(
        parseSnippetTable('## Sheet1\n| a | b |\n| 1 | 2 |')?.caption,
      ).toBe('Sheet1');
    });
  });

  describe('CSV from the fallback loaders', () => {
    it('reads comma lines from a spreadsheet, first line as header', () => {
      const table = parseSnippetTable(
        'Region,Q1,Q2\nNorth,1200,1350\n"South, East",980,"1,010"',
        'sales.csv',
      );
      expect(table).toEqual({
        caption: null,
        header: ['Region', 'Q1', 'Q2'],
        rows: [
          ['North', '1200', '1350'],
          ['South, East', '980', '1,010'],
        ],
        hasMoreRows: false,
      });
    });

    it('reads semicolon lines, the separator a Polish Excel exports', () => {
      const table = parseSnippetTable(
        'Miasto;Kwota\nKraków;12,50\nGdańsk;7,00',
        'kwoty.xlsx',
      );
      expect(table?.header).toEqual(['Miasto', 'Kwota']);
      expect(table?.rows[0]).toEqual(['Kraków', '12,50']);
    });

    it('drops the trailing empty columns SheetJS writes', () => {
      const table = parseSnippetTable('a,b,,\n1,2,,\n3,4,,', 'x.xlsx');
      expect(table?.header).toEqual(['a', 'b']);
    });

    it('drops a last line the server cap cut short', () => {
      const table = parseSnippetTable('a,b,c\n1,2,3\n4,5,6\n7,8', 'x.csv');
      expect(table?.rows).toEqual([
        ['1', '2', '3'],
        ['4', '5', '6'],
      ]);
      expect(table?.hasMoreRows).toBe(true);
    });

    it('does not read commas as columns in a file that is not a spreadsheet', () => {
      expect(
        parseSnippetTable(
          'Apples, pears, plums\nRed, green, blue',
          'notes.txt',
        ),
      ).toBeNull();
    });

    it('falls back when lines disagree about their width', () => {
      expect(
        parseSnippetTable(
          'We sold apples, pears and plums.\nThen, later, more.\nFin',
          'notes.csv',
        ),
      ).toBeNull();
    });
  });

  describe('text that is not a table', () => {
    it('returns null for prose', () => {
      expect(
        parseSnippetTable(
          'Trains must be booked in second class.\nReceipts go to finance.',
        ),
      ).toBeNull();
    });

    it('returns null for one line, even with pipes in it', () => {
      expect(
        parseSnippetTable('### How long? 14 days. | Refund | finance |'),
      ).toBeNull();
    });

    it('returns null for a table flattened onto one line', () => {
      // Its row boundaries are indistinguishable from an empty cell.
      expect(
        parseSnippetTable('| Refund | 14 days | | Appeal | 14 days |'),
      ).toBeNull();
    });

    it('returns null for prose around a table', () => {
      expect(
        parseSnippetTable(
          'Intro line.\nSecond line.\n| a | b |\n| 1 | 2 |\nOutro.',
        ),
      ).toBeNull();
    });

    it('returns null for a single pipe row without a header', () => {
      expect(parseSnippetTable('Caption\n| a | b |')).toBeNull();
    });

    it('returns null for a one-column table', () => {
      expect(parseSnippetTable('| a |\n| b |\n| c |')).toBeNull();
    });
  });
});

describe('isNumericCell', () => {
  it.each(['12', '-3.5', '1 234,56', '1,010', '45%', '+7'])(
    'reads %s as a number',
    (cell) => {
      expect(isNumericCell(cell)).toBe(true);
    },
  );

  it.each(['', 'North', '2024-01-05', 'Q1', '12 kg'])(
    'reads %s as text',
    (cell) => {
      expect(isNumericCell(cell)).toBe(false);
    },
  );
});
