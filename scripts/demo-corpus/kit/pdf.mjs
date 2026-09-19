/**
 * PDFs, rendered from HTML by the Chromium that Playwright already installs
 * for this repository's e2e suite.
 *
 * The call shape matches `kit/docx.mjs`, so a document's content reads the same
 * whichever format it is headed for. Chromium is the only PDF writer available
 * without adding a dependency — `docx` and `xlsx` cover the other two formats,
 * but nothing in this monorepo writes a PDF, since the ingest only ever reads
 * them. Rendering from HTML is also closer to what the corpus imitates: a
 * document exported from an office tool, with real headings in a larger bold
 * face for the ingest's heading detection to find (ADR-18), and real table
 * cells rather than space-aligned text.
 *
 * One browser is opened for the whole run and reused, because launching
 * Chromium costs more than rendering all eight documents.
 */

import { chromium } from 'playwright';

const BRAND_BLUE = '#252D53';
const GREY = '#5B6178';
const RULE = '#D4D7E3';
const ZEBRA = '#F6F7FA';

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const STYLES = `
  @page { size: A4; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, 'Liberation Sans', sans-serif;
    font-size: 10pt;
    line-height: 1.45;
    color: #1a1c25;
    margin: 0;
  }
  h1.doc-title { font-size: 21pt; color: ${BRAND_BLUE}; margin: 0 0 2pt; }
  p.doc-subtitle { font-size: 9.5pt; color: ${GREY}; margin: 0 0 16pt; }
  h1 { font-size: 15pt; color: ${BRAND_BLUE}; margin: 16pt 0 6pt; break-after: avoid; }
  h2 { font-size: 12.5pt; color: ${BRAND_BLUE}; margin: 12pt 0 5pt; break-after: avoid; }
  h3 { font-size: 11pt; color: ${BRAND_BLUE}; margin: 9pt 0 4pt; break-after: avoid; }
  p { margin: 0 0 7pt; }
  ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
  li { margin-bottom: 3pt; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 10pt;
    font-size: 8.8pt;
    break-inside: auto;
  }
  thead { display: table-header-group; }
  th {
    background: ${BRAND_BLUE};
    color: #fff;
    text-align: left;
    font-weight: bold;
    padding: 4pt 5pt;
    border: 0.5pt solid ${RULE};
  }
  td { padding: 4pt 5pt; border: 0.5pt solid ${RULE}; vertical-align: top; }
  tbody tr:nth-child(even) td { background: ${ZEBRA}; }
  tr { break-inside: avoid; }
`;

export function newDocument(locale = 'pl') {
  return { locale, blocks: [], footer: '', titleText: '' };
}

export function title(doc, text, subtitle) {
  doc.titleText = text;
  doc.blocks.push(`<h1 class="doc-title">${escapeHtml(text)}</h1>`);
  if (subtitle) {
    doc.blocks.push(`<p class="doc-subtitle">${escapeHtml(subtitle)}</p>`);
  }
}

export function heading(doc, text, level = 1) {
  const tag = `h${Math.min(level, 3)}`;
  doc.blocks.push(`<${tag}>${escapeHtml(text)}</${tag}>`);
}

export function para(doc, text, bold = false) {
  const body = escapeHtml(text);
  doc.blocks.push(`<p>${bold ? `<strong>${body}</strong>` : body}</p>`);
}

export function bullets(doc, items) {
  doc.blocks.push(`<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
}

export function numbered(doc, items) {
  doc.blocks.push(`<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`);
}

/** `widths` are relative weights, the same numbers `kit/docx.mjs` takes. */
export function table(doc, headers, rows, widths) {
  const weights = widths ?? headers.map(() => 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const cols = weights
    .map((weight) => `<col style="width:${((weight / total) * 100).toFixed(2)}%">`)
    .join('');

  const head = headers.map((label) => `<th>${escapeHtml(label)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`)
    .join('');

  doc.blocks.push(
    `<table><colgroup>${cols}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
  );
}

export function footerNote(doc, text) {
  doc.footer = text;
}

/** The HTML a document renders from — what the corpus test reads it back as. */
export function html(doc) {
  return [
    '<!doctype html>',
    `<html lang="${doc.locale}"><head><meta charset="utf-8">`,
    `<title>${escapeHtml(doc.titleText)}</title>`,
    `<style>${STYLES}</style></head><body>`,
    doc.blocks.join('\n'),
    '</body></html>',
  ].join('\n');
}

/**
 * Chromium, resolved the way Playwright resolves it.
 *
 * `CHROMIUM_EXECUTABLE_PATH` covers an environment that ships a browser
 * Playwright did not install itself; otherwise this needs the browser the e2e
 * suite already requires (`npx playwright install chromium`), and says so
 * rather than failing with Playwright's own wall of text.
 */
export async function openRenderer() {
  let browser;
  try {
    browser = await chromium.launch(
      process.env.CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
        : {},
    );
  } catch (error) {
    throw new Error(
      'Could not start Chromium, which renders the PDFs. Run `npx playwright install chromium` ' +
        '(the e2e suite needs it too), or set CHROMIUM_EXECUTABLE_PATH to a browser you already ' +
        `have.\n\n${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const page = await browser.newPage();

  return {
    async render(doc, path) {
      await page.setContent(html(doc), { waitUntil: 'load' });
      await page.pdf({
        path,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="width:100%;font-family:Arial,sans-serif;font-size:7.5pt;color:${GREY};
                      padding:0 18mm;display:flex;justify-content:space-between;">
            <span>${escapeHtml(doc.footer)}</span>
            <span class="pageNumber"></span>
          </div>`,
        margin: { top: '18mm', bottom: '20mm', left: '18mm', right: '18mm' },
      });
    },
    async close() {
      await browser.close();
    },
  };
}
