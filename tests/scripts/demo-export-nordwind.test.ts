import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import mammoth from 'mammoth';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import {
  exportLocale,
  fileNameFor,
  parseArgs,
  pdfHtml,
  planFiles,
  renderDocx,
  renderXlsx,
  safeFileName,
  splitSheets,
} from '../../scripts/demo/export-nordwind-documents';
import { contentEn } from '../../scripts/demo/nordwind/content-en';
import { contentPl } from '../../scripts/demo/nordwind/content-pl';
import { DOCS } from '../../scripts/demo/nordwind/structure';

describe('planFiles', () => {
  it.each([
    ['pl', contentPl],
    ['en', contentEn],
  ] as const)(
    'writes every version of every %s document once',
    (_, content) => {
      const files = planFiles(content);
      const expected = Object.values(content.documents).reduce(
        (n, d) => n + d.versions.length,
        0,
      );
      expect(files).toHaveLength(expected);
      expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
      // Exactly one active file per document.
      for (const doc of Object.keys(content.documents)) {
        expect(files.filter((f) => f.doc === doc && f.active)).toHaveLength(1);
      }
    },
  );

  it('gives each file the extension of the type the seed claims', () => {
    for (const f of planFiles(contentPl)) {
      const ext = path.extname(f.path).slice(1);
      const expected =
        ({ PDF: 'pdf', DOCX: 'docx', XLSX: 'xlsx' } as Record<string, string>)[
          f.type
        ] ?? 'md';
      expect(ext).toBe(expected);
    }
  });

  it('puts documents the seed stages in Brain under _brain-only', () => {
    for (const f of planFiles(contentPl).filter((f) => f.active)) {
      expect(f.path.startsWith('_brain-only')).toBe(
        DOCS[f.doc].staged === true,
      );
    }
  });

  it('nests a subfolder inside its parent, as the seed files it', () => {
    const payroll = planFiles(contentPl).find(
      (f) => f.doc === 'payroll-calendar' && f.active,
    )!;
    expect(payroll.path).toBe(
      path.join('HR', 'Płace', 'Kalendarz_wyplat_2026.xlsx'),
    );
  });

  it('keeps earlier versions apart from the active one', () => {
    const older = planFiles(contentPl).filter((f) => !f.active);
    expect(older.length).toBeGreaterThan(0);
    for (const f of older) {
      expect(f.path).toMatch(/^_older-versions\/.+__v\d+\.\w+$/);
    }
  });
});

describe('file names', () => {
  it('turns a URL into a file name without slashes', () => {
    expect(
      fileNameFor('https://nordwind-logistics.example/pl/zwroty', 'URL'),
    ).toBe('nordwind-logistics.example_pl_zwroty.md');
  });

  it('keeps a correct extension and adds a missing one', () => {
    expect(fileNameFor('Cennik_2026.xlsx', 'XLSX')).toBe('Cennik_2026.xlsx');
    expect(fileNameFor('Notatki', 'MARKDOWN')).toBe('Notatki.md');
  });

  it('removes characters no file system accepts', () => {
    expect(safeFileName('a:b*c?"d<e>f|g')).toBe('a_b_c_d_e_f_g');
  });
});

describe('splitSheets', () => {
  const text = `# Kalendarz

Arkusz: Terminy

| Miesiąc | Wypłata |
|---|---|
| Styczeń | 30.01.2026 |

Arkusz: Uwagi

Wynagrodzenie wypłacane jest ostatniego dnia roboczego.
`;

  it('starts a sheet at each marker and reads a table as cells', () => {
    const sheets = splitSheets(text);
    expect(sheets.map((s) => s.name)).toEqual(['Terminy', 'Uwagi']);
    expect(sheets[0].rows).toEqual([
      ['Miesiąc', 'Wypłata'],
      ['Styczeń', '30.01.2026'],
    ]);
    expect(sheets[1].rows).toEqual([
      ['Wynagrodzenie wypłacane jest ostatniego dnia roboczego.'],
    ]);
  });

  it('makes names Excel accepts: short, no brackets or colons, unique', () => {
    const sheets = splitSheets(
      'Sheet: Base prices (net, EUR) for every region and service\nSheet: Notes\nSheet: Notes',
    );
    expect(sheets[0].name.length).toBeLessThanOrEqual(31);
    expect(new Set(sheets.map((s) => s.name)).size).toBe(3);
  });

  it('drops a parenthetical aside before cutting a long name', () => {
    expect(
      splitSheets('Arkusz: Cennik podstawowy (ceny netto w PLN)')[0].name,
    ).toBe('Cennik podstawowy');
  });

  it('reads every XLSX document the seed has', () => {
    for (const content of [contentPl, contentEn]) {
      for (const [doc, meta] of Object.entries(DOCS)) {
        if (meta.type !== 'XLSX') {
          continue;
        }
        const text =
          content.documents[doc as keyof typeof DOCS].versions.at(-1)!;
        expect(splitSheets(text).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('renderXlsx', () => {
  it('writes a workbook that reads back with its sheets and cells', () => {
    const book = XLSX.read(
      renderXlsx(
        'Sheet: Prices\n\n| Service | Price |\n|---|---|\n| Pallet | 12 |',
      ),
    );
    expect(book.SheetNames).toEqual(['Prices']);
    const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets.Prices, {
      header: 1,
    });
    expect(rows).toEqual([
      ['Service', 'Price'],
      ['Pallet', '12'],
    ]);
  });
});

describe('renderDocx', () => {
  it('writes a Word file whose text reads back — headings, lists, tables', async () => {
    const buffer = await renderDocx(`# Title

## 1. Scope

Every employee gets **26 days**.

- first point
- second point

| Role | Days |
|---|---|
| Driver | 26 |
`);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    const { value } = await mammoth.extractRawText({ buffer });
    for (const text of [
      'Title',
      '1. Scope',
      'Every employee gets 26 days.',
      'second point',
      'Role',
      'Driver',
    ]) {
      expect(value).toContain(text);
    }
  });
});

describe('pdfHtml', () => {
  it('renders the markdown with its tables and escapes the title', () => {
    const html = pdfHtml('# A & B\n\n| x |\n|---|\n| 1 |', 'A & <B>', 'pl');
    expect(html).toContain('<html lang="pl">');
    expect(html).toContain('<table>');
    expect(html).not.toContain('<title>A & <B></title>');
  });
});

describe('exportLocale', () => {
  it('writes every planned file and a manifest', async () => {
    const out = await fs.mkdtemp(path.join(os.tmpdir(), 'nordwind-export-'));
    try {
      // PDFs need a browser; a fake printer keeps this test browser-free.
      const files = await exportLocale('en', out, async () =>
        Buffer.from('%PDF-1.7 fake'),
      );
      for (const f of files) {
        const stat = await fs.stat(path.join(out, 'en', f.path));
        expect(stat.size).toBeGreaterThan(0);
      }
      const written = await fs.readFile(
        path.join(out, 'en', 'MANIFEST.md'),
        'utf8',
      );
      expect(written).toContain('Upload into Brain');
    } finally {
      await fs.rm(out, { recursive: true, force: true });
    }
  });
});

describe('parseArgs', () => {
  it('defaults to both locales and ./nordwind-documents', () => {
    const args = parseArgs([]);
    expect(args.locales).toEqual(['pl', 'en']);
    expect(path.basename(args.out)).toBe('nordwind-documents');
  });

  it('refuses a locale the seed does not have', () => {
    expect(() => parseArgs(['--locale', 'de'])).toThrow(/pl or en/);
  });
});
