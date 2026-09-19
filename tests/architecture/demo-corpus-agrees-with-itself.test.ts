import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import mammoth from 'mammoth';
import XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import * as pdfKit from '../../scripts/demo-corpus/kit/pdf.mjs';
import { DOCUMENTS } from '../../scripts/demo-corpus/generate.mjs';
import * as annualReport from '../../scripts/demo-corpus/documents/annual-report.mjs';
import * as boardMinutes from '../../scripts/demo-corpus/documents/board-minutes.mjs';
import * as complaintsProcedure from '../../scripts/demo-corpus/documents/complaints-procedure.mjs';
import * as employeeHandbook from '../../scripts/demo-corpus/documents/employee-handbook.mjs';
import * as marketingBudget from '../../scripts/demo-corpus/documents/marketing-budget.mjs';
import * as priceList from '../../scripts/demo-corpus/documents/price-list.mjs';
import * as productCatalogue from '../../scripts/demo-corpus/documents/product-catalogue.mjs';
import * as salesFaq from '../../scripts/demo-corpus/documents/sales-faq.mjs';
import * as salesReport from '../../scripts/demo-corpus/documents/sales-report.mjs';
import * as serviceAgreement from '../../scripts/demo-corpus/documents/service-agreement.mjs';
import * as stockReport from '../../scripts/demo-corpus/documents/stock-report.mjs';

/**
 * The demo corpus has to agree with itself — across documents, and across the
 * two languages.
 *
 * This is the check `scripts/demo-corpus/verify.py` used to do outside CI, now
 * that the generator is Node and can be read from a test. It matters because a
 * demo fails in front of a prospect the moment two documents answer the same
 * question differently, and an edit to one document introduces that silently.
 *
 * **Spreadsheets are read the way the ingest reads them** — SheetJS to CSV —
 * not as raw cell values. That distinction is the whole point of one assertion
 * below: a number format of `# ##0` renders a seven-digit figure as
 * `27300 000 zł` through SheetJS while looking perfectly correct in Excel, so
 * the mangled string is what would reach the index, and reading raw values
 * would never show it.
 *
 * **PDFs are checked as the HTML they render from.** Nothing in this monorepo
 * extracts text from a PDF — the ingest hands them to a model — so the
 * content is asserted where it still exists as text, and the built file is
 * checked for being a real, non-empty PDF.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const CORPUS = join(REPO_ROOT, 'scripts/demo-corpus/files');
const SAMPLE_DOCS = join(REPO_ROOT, 'scripts/test-env/sample-docs');

const LOCALES = ['pl', 'en'] as const;
type Locale = (typeof LOCALES)[number];

const squash = (text: string) => text.replace(/\s+/g, ' ');

/** Everything that is not a digit, removed — how figures compare across locales. */
const digits = (text: string) => text.replace(/[^0-9]/g, '');

function xlsxText(path: string): string {
  const workbook = XLSX.readFile(path);
  return squash(
    workbook.SheetNames.map(
      (name) => `${name} ${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`,
    ).join(' '),
  );
}

async function docxText(path: string): Promise<string> {
  const { value } = await mammoth.extractRawText({ path });
  return squash(value);
}

function pdfSource(
  document: (typeof DOCUMENTS)[number],
  locale: Locale,
): string {
  const doc = pdfKit.newDocument(locale);
  document.build(pdfKit, doc, locale);
  return squash(pdfKit.html(doc));
}

/** The text of every document in one language, keyed by its file name. */
async function corpusText(locale: Locale): Promise<Record<string, string>> {
  const text: Record<string, string> = {};
  for (const document of DOCUMENTS) {
    const name = document.file[locale];
    const path = join(CORPUS, locale, name);
    if (document.format === 'pdf') {
      text[name] = pdfSource(document, locale);
    } else if (document.format === 'docx') {
      text[name] = await docxText(path);
    } else {
      text[name] = xlsxText(path);
    }
  }
  return text;
}

const TEXT: Record<Locale, Record<string, string>> = { pl: {}, en: {} };
for (const locale of LOCALES) {
  TEXT[locale] = await corpusText(locale);
}

/** One document's text in one language, by module rather than by position. */
const read = (document: { file: Record<Locale, string> }, locale: Locale) =>
  TEXT[locale][document.file[locale]];

describe('the built corpus', () => {
  it.each(LOCALES)('has every %s document committed', (locale) => {
    const present = readdirSync(join(CORPUS, locale));
    for (const document of DOCUMENTS) {
      expect(present).toContain(document.file[locale]);
    }
  });

  it.each(LOCALES)('holds real PDFs in %s', (locale) => {
    for (const document of DOCUMENTS.filter(
      (candidate) => candidate.format === 'pdf',
    )) {
      const path = join(CORPUS, locale, document.file[locale]);
      expect(existsSync(path)).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(bytes.byteLength).toBeGreaterThan(10_000);
    }
  });

  it.each(LOCALES)('yields readable text from every %s document', (locale) => {
    for (const [file, text] of Object.entries(TEXT[locale])) {
      expect(text.length, `${locale}/${file}`).toBeGreaterThan(1500);
    }
  });

  it('keeps the Polish diacritics the Polish documents need', () => {
    for (const [file, text] of Object.entries(TEXT.pl)) {
      expect(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text), file).toBe(true);
    }
  });
});

describe('spreadsheets survive the way the ingest reads them', () => {
  /**
   * The regression this exists for: `# ##0` looks like the Polish convention,
   * and SheetJS renders 27 300 000 under it as `27300 000`.
   */
  it.each(LOCALES)('groups thousands correctly in %s', (locale) => {
    const sales = read(salesReport, locale);
    expect(sales).toMatch(/27,300,000/);
    expect(sales).not.toMatch(/27300 000/);
  });

  it.each(LOCALES)('writes totals as values, not formulas, in %s', (locale) => {
    for (const document of DOCUMENTS.filter(
      (candidate) => candidate.format === 'xlsx',
    )) {
      const workbook = XLSX.readFile(
        join(CORPUS, locale, document.file[locale]),
      );
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const formulas = Object.keys(sheet)
          .filter((address) => !address.startsWith('!'))
          .filter((address) => sheet[address].f);
        expect(formulas, `${document.file[locale]}/${sheetName}`).toEqual([]);
      }
    }
  });
});

describe('the documents agree with each other', () => {
  it.each(LOCALES)('quotes one revenue figure for 2025 in %s', (locale) => {
    const report = read(annualReport, locale);
    const sales = read(salesReport, locale);
    expect(digits(report)).toContain('486');
    expect(sales).toMatch(/48,600,000/);
  });

  it.each(LOCALES)('quotes one marketing budget in %s', (locale) => {
    const minutes = read(boardMinutes, locale);
    const budget = read(marketingBudget, locale);
    expect(minutes).toMatch(/1[  ,]240[  ,]000/);
    expect(budget).toMatch(/1,240,000/);
  });

  it.each(LOCALES)(
    'lists every SKU in the catalogue, price list and stock report in %s',
    (locale) => {
      const catalogue = read(productCatalogue, locale);
      const prices = read(priceList, locale);
      const stock = read(stockReport, locale);
      for (const sku of [
        'RGM-200',
        'RGM-350',
        'RGP-120',
        'RGW-080',
        'WZR-15',
        'WZU-13',
        'WZE-20',
        'AKB-050',
        'AKO-100',
        'AKS-025',
        'AKK-001',
      ]) {
        expect(catalogue, `catalogue/${sku}`).toContain(sku);
        expect(prices, `prices/${sku}`).toContain(sku);
        expect(stock, `stock/${sku}`).toContain(sku);
      }
    },
  );

  it.each(LOCALES)(
    'flags the two SKUs below minimum, and says when they arrive, in %s',
    (locale) => {
      const stock = read(stockReport, locale);
      expect(stock).toContain('WZE-20');
      expect(stock).toContain('AKS-025');
      expect(stock).toContain('ZAM/2026/041');
    },
  );

  it.each(LOCALES)(
    'gives the same SLA fee in the agreement and the FAQ in %s',
    (locale) => {
      const sla = read(serviceAgreement, locale);
      const faq = read(salesFaq, locale);
      expect(digits(sla)).toContain('8400');
      expect(digits(faq)).toContain('8400');
    },
  );

  it.each(LOCALES)(
    'gives the same complaint deadline in the procedure and the FAQ in %s',
    (locale) => {
      const procedure = read(complaintsProcedure, locale);
      const faq = read(salesFaq, locale);
      const deadline =
        locale === 'pl' ? '14 dni kalendarzowych' : '14 calendar days';
      expect(procedure).toContain(deadline);
      expect(faq).toContain(deadline);
    },
  );

  it.each(LOCALES)('opens the Gdańsk warehouse on one date in %s', (locale) => {
    const date = locale === 'pl' ? '1 czerwca 2026' : '1 June 2026';
    for (const document of [
      annualReport,
      stockReport,
      boardMinutes,
      salesFaq,
    ]) {
      expect(read(document, locale), document.file[locale]).toContain(date);
    }
  });
});

describe('the two languages agree', () => {
  /**
   * Compared as digits: the Polish and English documents format the same
   * figures differently — 1 480,00 zł against PLN 1,480.00 — and it is the
   * figure, not the formatting, that has to match.
   */
  it.each([
    ['2025 revenue', '48600000'],
    ['the marketing budget', '1240000'],
    ['the SLA minimum fee', '8400'],
    ['the RGM-200 list price', '148000'],
  ])('quotes %s identically in both languages', (_label, expected) => {
    for (const locale of LOCALES) {
      const all = digits(Object.values(TEXT[locale]).join(' '));
      expect(all, locale).toContain(expected);
    }
  });

  it('prices every product identically in both languages', () => {
    const [pl, en] = LOCALES.map((locale) => read(priceList, locale));
    for (const price of [
      '148000',
      '224000',
      '64000',
      '315000',
      '89000',
      '570000',
      '1240000',
    ]) {
      expect(digits(pl), `pl/${price}`).toContain(price);
      expect(digits(en), `en/${price}`).toContain(price);
    }
  });
});

describe('the handbook agrees with scripts/test-env/sample-docs', () => {
  const markdown = squash(
    readdirSync(SAMPLE_DOCS)
      .filter((file) => file.endsWith('.md'))
      .map((file) => readFileSync(join(SAMPLE_DOCS, file), 'utf8'))
      .join('\n'),
  );

  it.each([
    ['12 remote days a month', '12'],
    ['the PLN 180 remote-work allowance', '180'],
    ['26 days of annual leave', '26'],
    ['the PLN 450 accommodation limit', '450'],
  ])('states %s the same way', (_label, figure) => {
    for (const locale of LOCALES) {
      expect(read(employeeHandbook, locale), locale).toContain(figure);
    }
    expect(markdown).toContain(figure);
  });
});
