#!/usr/bin/env node
/**
 * Build the demo corpus into `files/pl` and `files/en`.
 *
 *     node scripts/demo-corpus/generate.mjs           # both languages
 *     node scripts/demo-corpus/generate.mjs --locale=en
 *
 * Every dependency it needs is already in this monorepo: `docx` and `xlsx`
 * from `apps/worker`, and the Chromium that Playwright installs for the e2e
 * suite. Nothing here is installed just to build a corpus.
 *
 * Deterministic — no randomness anywhere — so regenerating after an edit
 * produces a diff of what changed and nothing else. The output is committed,
 * because somebody running a demo should not have to build it first.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCALES } from './data.mjs';
import * as docxKit from './kit/docx.mjs';
import * as pdfKit from './kit/pdf.mjs';
import * as xlsxKit from './kit/xlsx.mjs';

import * as annualReport from './documents/annual-report.mjs';
import * as boardMinutes from './documents/board-minutes.mjs';
import * as complaintsProcedure from './documents/complaints-procedure.mjs';
import * as employeeHandbook from './documents/employee-handbook.mjs';
import * as frameworkAgreement from './documents/framework-agreement.mjs';
import * as marketingBudget from './documents/marketing-budget.mjs';
import * as priceList from './documents/price-list.mjs';
import * as productCatalogue from './documents/product-catalogue.mjs';
import * as salesFaq from './documents/sales-faq.mjs';
import * as salesReport from './documents/sales-report.mjs';
import * as serviceAgreement from './documents/service-agreement.mjs';
import * as stockReport from './documents/stock-report.mjs';

// `fileURLToPath`, not `.pathname`: a URL path is percent-encoded, so a
// checkout under a directory with a space in it would write the corpus
// somewhere nobody looks. The same trap `build-corpus.mjs` documents.
const HERE = dirname(fileURLToPath(import.meta.url));

export const DOCUMENTS = [
  productCatalogue,
  serviceAgreement,
  annualReport,
  employeeHandbook,
  priceList,
  salesReport,
  stockReport,
  marketingBudget,
  frameworkAgreement,
  complaintsProcedure,
  boardMinutes,
  salesFaq,
];

/** Build one document into `directory`, returning the bytes written. */
export async function buildDocument(document, locale, directory, renderer) {
  const path = join(directory, document.file[locale]);

  if (document.format === 'pdf') {
    const doc = pdfKit.newDocument(locale);
    document.build(pdfKit, doc, locale);
    await renderer.render(doc, path);
  } else if (document.format === 'docx') {
    const doc = docxKit.newDocument(locale);
    document.build(docxKit, doc, locale);
    await docxKit.save(doc, path);
  } else {
    const workbook = xlsxKit.newWorkbook();
    document.build(xlsxKit, workbook, locale);
    xlsxKit.save(workbook, path);
  }

  return path;
}

async function main() {
  const requested = process.argv
    .filter((argument) => argument.startsWith('--locale='))
    .map((argument) => argument.slice('--locale='.length));
  const locales = requested.length > 0 ? requested : LOCALES;

  for (const locale of locales) {
    if (!LOCALES.includes(locale)) {
      throw new Error(`Unknown locale "${locale}". Known: ${LOCALES.join(', ')}.`);
    }
  }

  // One browser for the whole run: launching Chromium costs more than
  // rendering every PDF in the corpus.
  const renderer = await pdfKit.openRenderer();

  try {
    for (const locale of locales) {
      const directory = join(HERE, 'files', locale);
      await mkdir(directory, { recursive: true });
      console.log(`\n${locale}  →  ${directory}`);

      for (const document of DOCUMENTS) {
        const path = await buildDocument(document, locale, directory, renderer);
        const { size } = await import('node:fs/promises').then((fs) => fs.stat(path));
        console.log(`  ${document.file[locale].padEnd(34)} ${(size / 1024).toFixed(1).padStart(7)} KB`);
      }
    }
  } finally {
    await renderer.close();
  }

  // A README beside each set, so a folder that has been downloaded and passed
  // around still says what it is and which language it is in.
  for (const locale of locales) {
    await writeFile(
      join(HERE, 'files', locale, 'README.txt'),
      locale === 'pl'
        ? 'Demonstracyjny korpus dokumentów fikcyjnej firmy Acme Industries sp. z o.o.\n' +
            'Wszystkie dane są zmyślone. Wersja angielska: ../en\n' +
            'Opis i pytania demo: scripts/demo-corpus/README.md\n'
        : 'Demonstration corpus for the fictional company Acme Industries sp. z o.o.\n' +
            'Every figure is invented. Polish version: ../pl\n' +
            'What it holds and the demo questions: scripts/demo-corpus/README.md\n',
      'utf8',
    );
  }

  console.log(`\n${DOCUMENTS.length} documents × ${locales.length} language(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
