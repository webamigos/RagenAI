/**
 * The Nordwind Logistics documents as real files — PDF, DOCX, XLSX and
 * Markdown — for uploading to an environment the seed cannot reach.
 *
 * The seed (`seed-nordwind.ts`) writes database rows only: each document's
 * text is stored the way ingest would have left it, and no file ever exists.
 * That is enough for local screenshots and useless for demo.ragen.ai, which
 * the seed refuses to touch and which has to ingest real uploads through its
 * own worker. This renders the same text into the formats the seed claims:
 *
 *   npm run demo:export-documents -- --locale pl --out ./nordwind-documents
 *
 * Output, per locale:
 *
 *   <out>/<locale>/<folder>/<file name>      the active version of each file
 *   <out>/<locale>/_older-versions/…          earlier versions, to upload as
 *                                             new versions and show the diff
 *   <out>/<locale>/_brain-only/…              files the seed stages in Brain
 *                                             (upload with "Upload into Brain")
 *   <out>/<locale>/MANIFEST.md                what goes where, and who owns it
 *
 * A web-page document (type URL) is written as Markdown: its address is on a
 * domain that does not exist, so there is nothing for the demo to scrape.
 *
 * PDFs are printed by headless Chromium (Playwright); DOCX and XLSX are built
 * with the same `docx` and `xlsx` packages the worker reads them with.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import MarkdownIt from 'markdown-it';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import * as XLSX from 'xlsx';

import { contentEn } from './nordwind/content-en';
import { contentPl } from './nordwind/content-pl';
import { DOCS, FOLDERS } from './nordwind/structure';
import type {
  DemoContent,
  DemoFileType,
  DocKey,
  FolderKey,
  Locale,
} from './nordwind/types';

const md = new MarkdownIt({ html: false, linkify: false });

const EXTENSION: Record<DemoFileType, string> = {
  PDF: 'pdf',
  DOCX: 'docx',
  XLSX: 'xlsx',
  MARKDOWN: 'md',
  URL: 'md',
};

export interface PlannedFile {
  doc: DocKey;
  type: DemoFileType;
  /** 1-based; the last one is the active version. */
  version: number;
  active: boolean;
  /** Relative to the locale's directory. */
  path: string;
  markdown: string;
}

/** A name that is safe on every file system and still reads as the original. */
export function safeFileName(name: string): string {
  return name
    .replace(/^https?:\/\//i, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** The file name a document is uploaded under, with the right extension. */
export function fileNameFor(fileName: string, type: DemoFileType): string {
  const ext = EXTENSION[type];
  const base = safeFileName(fileName);
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}

/** A folder's path from the root, so "Płace" lands inside "HR" as it does in the seed. */
export function folderPath(content: DemoContent, folder: FolderKey): string {
  const parts: string[] = [];
  for (let f: FolderKey | undefined = folder; f; f = FOLDERS[f].parent) {
    parts.unshift(safeFileName(content.folders[f]));
  }
  return path.join(...parts);
}

/** Every file to write for one locale, active versions and older ones. */
export function planFiles(content: DemoContent): PlannedFile[] {
  const files: PlannedFile[] = [];
  for (const doc of Object.keys(content.documents) as DocKey[]) {
    const meta = DOCS[doc];
    const { fileName, versions } = content.documents[doc];
    const name = fileNameFor(fileName, meta.type);
    const folder = meta.staged
      ? '_brain-only'
      : folderPath(content, meta.folder);
    versions.forEach((markdown, i) => {
      const version = i + 1;
      const active = version === versions.length;
      const ext = path.extname(name);
      files.push({
        doc,
        type: meta.type,
        version,
        active,
        path: active
          ? path.join(folder, name)
          : path.join(
              '_older-versions',
              `${path.basename(name, ext)}__v${version}${ext}`,
            ),
        markdown,
      });
    });
  }
  return files;
}

// --- XLSX ----------------------------------------------------------------------

/** The markers the seed's XLSX text uses to start a sheet, per language. */
const SHEET_MARKER = /^(?:Arkusz|Sheet):\s*(.+)$/;

export interface Sheet {
  name: string;
  rows: string[][];
}

/** Excel's rules: at most 31 characters, none of `[]:*?/\`, unique. */
function sheetName(raw: string, taken: Set<string>): string {
  let clean = raw.replace(/[[\]:*?/\\]/g, ' ').trim();
  // "Cennik podstawowy (ceny netto w PLN)" is 36: drop the aside before
  // cutting a word in half.
  if (clean.length > 31) {
    clean = clean.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  }
  const base = clean.slice(0, 31).trim() || 'Sheet';
  let name = base;
  for (let n = 2; taken.has(name); n += 1) {
    name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  }
  taken.add(name);
  return name;
}

/**
 * The sheets an XLSX document's text describes: each `Arkusz:`/`Sheet:` line
 * starts one; a Markdown table becomes rows and cells, any other line one
 * cell. Text before the first marker (the title) goes on a sheet of its own
 * only if there is no marker at all.
 */
export function splitSheets(markdown: string): Sheet[] {
  const taken = new Set<string>();
  const sheets: Sheet[] = [];
  let current: Sheet | null = null;
  const preamble: string[][] = [];
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const marker = SHEET_MARKER.exec(line);
    if (marker) {
      current = { name: sheetName(marker[1], taken), rows: [] };
      sheets.push(current);
      continue;
    }
    if (!line || /^\|?\s*:?-{2,}/.test(line)) {
      continue;
    }
    const row = line.startsWith('|')
      ? line
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((cell) => cell.trim())
      : [line.replace(/^#+\s*/, '')];
    (current ? current.rows : preamble).push(row);
  }
  if (sheets.length === 0) {
    return [{ name: 'Sheet1', rows: preamble }];
  }
  return sheets;
}

export function renderXlsx(markdown: string): Buffer {
  const book = XLSX.utils.book_new();
  for (const sheet of splitSheets(markdown)) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    const widths = sheet.rows.reduce<number[]>((acc, row) => {
      row.forEach((cell, i) => {
        acc[i] = Math.min(Math.max(acc[i] ?? 8, cell.length + 2), 60);
      });
      return acc;
    }, []);
    ws['!cols'] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(book, ws, sheet.name);
  }
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// --- DOCX ----------------------------------------------------------------------

type Token = ReturnType<MarkdownIt['parse']>[number];

/** Inline tokens as runs, keeping bold and italic. */
function runs(inline: Token | undefined): TextRun[] {
  const out: TextRun[] = [];
  let bold = false;
  let italics = false;
  for (const child of inline?.children ?? []) {
    if (child.type === 'strong_open') {
      bold = true;
    } else if (child.type === 'strong_close') {
      bold = false;
    } else if (child.type === 'em_open') {
      italics = true;
    } else if (child.type === 'em_close') {
      italics = false;
    } else if (child.type === 'text' || child.type === 'code_inline') {
      out.push(new TextRun({ text: child.content, bold, italics }));
    } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
      out.push(new TextRun({ text: ' ' }));
    }
  }
  return out;
}

function textOf(inline: Token | undefined): string {
  return (inline?.children ?? [])
    .filter((c) => c.type === 'text' || c.type === 'code_inline')
    .map((c) => c.content)
    .join('');
}

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
] as const;

/**
 * A Word document from the seed's Markdown: headings, paragraphs, bulleted and
 * numbered lists, tables. What Docling reads back is close to the input, so
 * the demo ingests roughly the text the seed stores.
 */
export async function renderDocx(markdown: string): Promise<Buffer> {
  const tokens = md.parse(markdown, {});
  const body: (Paragraph | Table)[] = [];
  const lists: ('bullet' | 'ordered')[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === 'heading_open') {
      const level = Math.min(Number(t.tag.slice(1)), 4) - 1;
      body.push(
        new Paragraph({
          heading: HEADINGS[level],
          children: runs(tokens[i + 1]),
        }),
      );
      i += 2;
    } else if (t.type === 'bullet_list_open') {
      lists.push('bullet');
    } else if (t.type === 'ordered_list_open') {
      lists.push('ordered');
    } else if (
      t.type === 'bullet_list_close' ||
      t.type === 'ordered_list_close'
    ) {
      lists.pop();
    } else if (t.type === 'paragraph_open') {
      const inline = tokens[i + 1];
      const kind = lists[lists.length - 1];
      body.push(
        new Paragraph({
          children: runs(inline),
          ...(kind === 'bullet' ? { bullet: { level: lists.length - 1 } } : {}),
          ...(kind === 'ordered'
            ? { numbering: { reference: 'numbered', level: lists.length - 1 } }
            : {}),
        }),
      );
      i += 2;
    } else if (t.type === 'table_open') {
      const rows: TableRow[] = [];
      let cells: TableCell[] = [];
      let header = false;
      for (
        i += 1;
        i < tokens.length && tokens[i].type !== 'table_close';
        i += 1
      ) {
        const c = tokens[i];
        if (c.type === 'thead_open') {
          header = true;
        } else if (c.type === 'thead_close') {
          header = false;
        } else if (c.type === 'tr_open') {
          cells = [];
        } else if (c.type === 'tr_close') {
          rows.push(new TableRow({ children: cells, tableHeader: header }));
        } else if (c.type === 'th_open' || c.type === 'td_open') {
          const inline = tokens[i + 1];
          cells.push(
            new TableCell({
              children: [
                new Paragraph({
                  children:
                    c.type === 'th_open'
                      ? [new TextRun({ text: textOf(inline), bold: true })]
                      : runs(inline),
                }),
              ],
            }),
          );
        }
      }
      body.push(
        new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }),
      );
    }
  }
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'numbered',
          levels: [0, 1, 2].map((level) => ({
            level,
            format: 'decimal' as const,
            text: `%${level + 1}.`,
          })),
        },
      ],
    },
    sections: [{ children: body }],
  });
  return Packer.toBuffer(doc);
}

// --- PDF -----------------------------------------------------------------------

const PDF_CSS = `
  body { font: 11pt/1.5 "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; }
  h1 { font-size: 20pt; margin: 0 0 12pt; color: #252d53; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt; color: #252d53; }
  h3 { font-size: 12pt; margin: 14pt 0 4pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 10pt; }
  th, td { border: 1px solid #c8c8c8; padding: 4pt 6pt; text-align: left; }
  th { background: #f2f2f5; }
`;

/** The HTML a PDF is printed from; exported so it can be tested without a browser. */
export function pdfHtml(markdown: string, title: string, lang: Locale): string {
  const escaped = title.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escaped}</title><style>${PDF_CSS}</style></head><body>${md.render(markdown)}</body></html>`;
}

export type PdfPrinter = (html: string) => Promise<Buffer>;

async function chromiumPrinter(): Promise<{
  print: PdfPrinter;
  close: () => Promise<void>;
}> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  return {
    print: async (html) => {
      await page.setContent(html, { waitUntil: 'load' });
      return page.pdf({
        format: 'A4',
        margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
        printBackground: true,
      });
    },
    close: () => browser.close(),
  };
}

// --- Manifest --------------------------------------------------------------------

export function manifest(content: DemoContent, files: PlannedFile[]): string {
  const lines = [
    `# Nordwind Logistics — ${content.orgName}`,
    '',
    'Upload the files in each folder into the knowledge-base folder of the same name.',
    'Files in `_brain-only/` go in through Brain → Documents → **Upload into Brain**.',
    'Files in `_older-versions/` are earlier versions: upload the `__v1` file first,',
    'then replace it with the active one to show a version diff.',
    '',
    '| File | Folder | Owner | Version |',
    '|---|---|---|---|',
  ];
  for (const f of files) {
    const meta = DOCS[f.doc];
    lines.push(
      `| ${path.basename(f.path)} | ${meta.staged ? 'Brain only' : folderPath(content, meta.folder)} | ${content.people[meta.owner].name} | ${f.version}${f.active ? ' (active)' : ''} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

// --- Runner --------------------------------------------------------------------

export async function exportLocale(
  locale: Locale,
  outDir: string,
  print: PdfPrinter,
): Promise<PlannedFile[]> {
  const content = locale === 'pl' ? contentPl : contentEn;
  const files = planFiles(content);
  const root = path.join(outDir, locale);
  for (const file of files) {
    const target = path.join(root, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const title = content.documents[file.doc].title;
    let bytes: Buffer | string;
    if (file.type === 'DOCX') {
      bytes = await renderDocx(file.markdown);
    } else if (file.type === 'XLSX') {
      bytes = renderXlsx(file.markdown);
    } else if (file.type === 'PDF') {
      bytes = await print(pdfHtml(file.markdown, title, locale));
    } else {
      bytes = file.markdown;
    }
    await fs.writeFile(target, bytes);
  }
  await fs.writeFile(path.join(root, 'MANIFEST.md'), manifest(content, files));
  return files;
}

export function parseArgs(argv: readonly string[]): {
  locales: Locale[];
  out: string;
} {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const locale = arg('--locale');
  if (locale && locale !== 'pl' && locale !== 'en') {
    throw new Error(`--locale must be pl or en, got "${locale}"`);
  }
  return {
    locales: locale ? [locale as Locale] : ['pl', 'en'],
    out: path.resolve(arg('--out') ?? 'nordwind-documents'),
  };
}

async function main(): Promise<void> {
  const { locales, out } = parseArgs(process.argv.slice(2));
  const printer = await chromiumPrinter();
  try {
    for (const locale of locales) {
      const files = await exportLocale(locale, out, printer.print);
      console.log(
        `${locale}: ${files.length} files → ${path.join(out, locale)}`,
      );
    }
  } finally {
    await printer.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
