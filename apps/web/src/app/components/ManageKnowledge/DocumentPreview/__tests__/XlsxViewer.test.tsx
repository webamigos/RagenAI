import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import * as XLSX from 'xlsx';

import { XlsxViewer, XLSX_PREVIEW_MAX_ROWS } from '../viewers/XlsxViewer';

/**
 * #1268. The workbooks here are real ones, written by SheetJS itself and read
 * back by the viewer — mocking the parser would test the mock's idea of what
 * `sheet_to_json` returns, which is the part most likely to be wrong.
 */
const messages = {
  'document-preview': {
    loading: 'Loading...',
    'error-loading': 'Failed to load file.',
    'xlsx-sheets': 'Sheets',
    'xlsx-truncated':
      'Showing the first {shown, number} of {total, number} rows. Download the file to see all of them.',
    'xlsx-empty-sheet': 'This sheet is empty.',
  },
};

function renderViewer(url = '/api/files/xlsx1', maxRows?: number) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <XlsxViewer contentUrl={url} maxRows={maxRows} />
    </NextIntlClientProvider>,
  );
}

function workbook(sheets: Record<string, unknown[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return wb;
}

function serve(
  wb: XLSX.WorkBook,
  bookType: XLSX.BookType = 'xlsx',
): ArrayBuffer {
  const bytes = XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => bytes,
  } as Response);
  return bytes;
}

describe('XlsxViewer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the loading state first', () => {
    serve(workbook({ Arkusz1: [['a']] }));
    renderViewer();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders a workbook as a table, with column letters and row numbers', async () => {
    serve(
      workbook({
        Cennik: [
          ['Produkt', 'Cena'],
          ['Herbata', 12.5],
          ['Kawa', 30],
        ],
      }),
    );
    renderViewer();

    const table = await screen.findByRole('table');
    expect(
      within(table).getByRole('columnheader', { name: 'A' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'B' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('rowheader', { name: '3' }),
    ).toBeInTheDocument();
    expect(within(table).getByText('Produkt')).toBeInTheDocument();
    expect(within(table).getByText('Herbata')).toBeInTheDocument();
    expect(within(table).getByText('12.5')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/files/xlsx1');
  });

  it('renders cell text as text, never as markup', async () => {
    serve(workbook({ S: [['<img src=x onerror=alert(1)>']] }));
    const { container } = renderViewer();

    expect(
      await screen.findByText('<img src=x onerror=alert(1)>'),
    ).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('switches between sheets', async () => {
    const user = userEvent.setup();
    serve(
      workbook({
        Styczeń: [['pierwszy arkusz']],
        Luty: [['drugi arkusz']],
      }),
    );
    renderViewer();

    const tabs = await screen.findByRole('tablist', { name: 'Sheets' });
    const first = within(tabs).getByRole('tab', { name: 'Styczeń' });
    const second = within(tabs).getByRole('tab', { name: 'Luty' });

    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('pierwszy arkusz')).toBeInTheDocument();

    await user.click(second);

    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('drugi arkusz')).toBeInTheDocument();
    expect(screen.queryByText('pierwszy arkusz')).not.toBeInTheDocument();
  });

  it('opens the next file at its first sheet, not the sheet picked in the last one', async () => {
    const user = userEvent.setup();
    serve(workbook({ A1: [['plik 1, arkusz 1']], A2: [['plik 1, arkusz 2']] }));
    const { rerender } = renderViewer('/api/files/one');
    await user.click(await screen.findByRole('tab', { name: 'A2' }));
    expect(screen.getByText('plik 1, arkusz 2')).toBeInTheDocument();

    serve(workbook({ B1: [['plik 2, arkusz 1']], B2: [['plik 2, arkusz 2']] }));
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <XlsxViewer contentUrl="/api/files/two" />
      </NextIntlClientProvider>,
    );

    expect(await screen.findByText('plik 2, arkusz 1')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'B1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('shows no sheet switcher for a single-sheet workbook', async () => {
    serve(workbook({ Jedyny: [['x']] }));
    renderViewer();

    await screen.findByRole('table');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('shows error-loading when the fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    renderViewer();

    expect(await screen.findByText('Failed to load file.')).toBeInTheDocument();
  });

  it('shows error-loading when the network rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));
    renderViewer();

    expect(await screen.findByText('Failed to load file.')).toBeInTheDocument();
  });

  // Proven on a small cap: a thousand rendered rows outran the 5 s timeout
  // under CI's coverage run. The production value has its own assertion.
  it('renders at most the capped number of rows, and says so', async () => {
    const cap = 20;
    const rows = Array.from({ length: cap + 5 }, (_, i) => [`wiersz ${i + 1}`]);
    serve(workbook({ Duży: rows }));
    renderViewer('/api/files/xlsx1', cap);

    const table = await screen.findByRole('table');
    expect(within(table).getByText(`wiersz ${cap}`)).toBeInTheDocument();
    expect(
      within(table).queryByText(`wiersz ${cap + 1}`),
    ).not.toBeInTheDocument();
    // One header row plus the capped body.
    expect(within(table).getAllByRole('row')).toHaveLength(cap + 1);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing the first 20 of 25 rows.',
    );
  });

  it('caps a sheet at 1,000 rows in production', () => {
    expect(XLSX_PREVIEW_MAX_ROWS).toBe(1000);
  });

  it('says nothing about a cap on a sheet that fits under it', async () => {
    serve(workbook({ Mały: [['a'], ['b']] }));
    renderViewer();

    await screen.findByRole('table');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says so when the selected sheet is empty', async () => {
    const wb = workbook({ Pełny: [['x']] });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Pusty');
    serve(wb);
    const user = userEvent.setup();
    renderViewer();

    await user.click(await screen.findByRole('tab', { name: 'Pusty' }));

    expect(screen.getByText('This sheet is empty.')).toBeInTheDocument();
  });

  // `.xls` maps to XLSX in `fileTypeFromName`, so this viewer gets the legacy
  // binary format too. SheetJS reads it; this proves the viewer does.
  it('reads a legacy .xls (BIFF8) workbook', async () => {
    serve(workbook({ Stary: [['z epoki Excela 2003']] }), 'biff8');
    renderViewer();

    expect(await screen.findByText('z epoki Excela 2003')).toBeInTheDocument();
  });
});
