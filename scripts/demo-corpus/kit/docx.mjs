/**
 * Word documents, through the `docx` package `apps/worker` already depends on.
 *
 * The call shape matches `kit/html.mjs`, so a document's content reads the same
 * whichever format it is headed for. Headings use Word's real `Heading N`
 * styles rather than bold paragraphs, because the ingest's heading detection
 * reads structure and a bold paragraph is not structure (ADR-18).
 *
 * The base font is Arial: present on Windows and macOS, and substituted with
 * the metric-compatible Liberation Sans on Linux, so the corpus looks the same
 * on the machine that builds it and the laptop that opens it.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { writeFile } from 'node:fs/promises';

const BRAND_BLUE = '252D53';
const GREY = '5B6178';
const RULE = 'D4D7E3';
const ZEBRA = 'F6F7FA';

const HEADING = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
};

/** Half-points, which is how OOXML measures a font size. */
const pt = (size) => size * 2;

/** Twentieths of a point, which is how it measures everything else. */
const twip = (points) => Math.round(points * 20);

export function newDocument(locale = 'pl') {
  return { locale, children: [], footer: '', titleText: '' };
}

export function title(doc, text, subtitle) {
  doc.titleText = text;
  doc.children.push(
    new Paragraph({
      spacing: { after: subtitle ? twip(2) : twip(12) },
      children: [new TextRun({ text, bold: true, size: pt(21), color: BRAND_BLUE })],
    }),
  );
  if (subtitle) {
    doc.children.push(
      new Paragraph({
        spacing: { after: twip(14) },
        children: [new TextRun({ text: subtitle, size: pt(9.5), color: GREY })],
      }),
    );
  }
}

export function heading(doc, text, level = 1) {
  doc.children.push(
    new Paragraph({
      heading: HEADING[Math.min(level, 3)],
      spacing: { before: twip(level === 1 ? 14 : 10), after: twip(5) },
      children: [new TextRun({ text, bold: true, size: pt(level === 1 ? 15 : 12.5), color: BRAND_BLUE })],
    }),
  );
}

export function para(doc, text, bold = false) {
  doc.children.push(
    new Paragraph({
      spacing: { after: twip(6), line: 276 },
      children: [new TextRun({ text, bold, size: pt(10.5) })],
    }),
  );
}

export function bullets(doc, items) {
  for (const item of items) {
    doc.children.push(
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: twip(3), line: 276 },
        children: [new TextRun({ text: item, size: pt(10.5) })],
      }),
    );
  }
  doc.children.push(new Paragraph({ spacing: { after: twip(4) }, children: [] }));
}

/**
 * Numbered manually rather than through Word's numbering definitions.
 *
 * A contract clause is quoted as "§ 5 point 3", and a reader — or a retrieval
 * chunk — that sees the number as text can answer that. Word's own numbering
 * lives in the document's numbering part, so it does not appear in the text at
 * all, and `mammoth` (which is how this repository's ingest reads DOCX) drops
 * it entirely.
 */
export function numbered(doc, items) {
  items.forEach((item, index) => {
    doc.children.push(
      new Paragraph({
        spacing: { after: twip(3), line: 276 },
        indent: { left: twip(14), hanging: twip(14) },
        children: [new TextRun({ text: `${index + 1}. ${item}`, size: pt(10.5) })],
      }),
    );
  });
  doc.children.push(new Paragraph({ spacing: { after: twip(4) }, children: [] }));
}

function cell(text, { header = false, width, emphasis = false, zebra = false } = {}) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: header
      ? { type: ShadingType.CLEAR, fill: BRAND_BLUE }
      : zebra
        ? { type: ShadingType.CLEAR, fill: ZEBRA }
        : undefined,
    margins: { top: twip(3), bottom: twip(3), left: twip(5), right: twip(5) },
    children: [
      new Paragraph({
        spacing: { after: 0 },
        children: [
          new TextRun({
            text: String(text),
            bold: header || emphasis,
            size: pt(9.5),
            color: header ? 'FFFFFF' : undefined,
          }),
        ],
      }),
    ],
  });
}

/**
 * `widths` are relative weights, normalised to percentages — the same numbers
 * the HTML kit takes, so the two formats lay a table out the same way.
 */
export function table(doc, headers, rows, widths) {
  const weights = widths ?? headers.map(() => 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const percentages = weights.map((weight) => (weight / total) * 100);

  const border = { style: BorderStyle.SINGLE, size: 4, color: RULE };

  doc.children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: [
        new TableRow({
          tableHeader: true,
          children: headers.map((label, index) => cell(label, { header: true, width: percentages[index] })),
        }),
        ...rows.map(
          (row, rowIndex) =>
            new TableRow({
              children: row.map((value, index) =>
                cell(value, { width: percentages[index], zebra: rowIndex % 2 === 1 }),
              ),
            }),
        ),
      ],
    }),
  );
  doc.children.push(new Paragraph({ spacing: { after: twip(8) }, children: [] }));
}

export function footerNote(doc, text) {
  doc.footer = text;
}

export async function save(doc, path) {
  const document = new Document({
    creator: 'Acme Industries sp. z o.o.',
    title: doc.titleText,
    styles: {
      default: {
        document: { run: { font: 'Arial', size: pt(10.5) } },
        heading1: { run: { font: 'Arial', color: BRAND_BLUE } },
        heading2: { run: { font: 'Arial', color: BRAND_BLUE } },
        heading3: { run: { font: 'Arial', color: BRAND_BLUE } },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: twip(62), bottom: twip(62), left: twip(68), right: twip(68) } },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: doc.footer, size: pt(8), color: GREY })],
              }),
            ],
          }),
        },
        children: doc.children,
      },
    ],
  });

  await writeFile(path, await Packer.toBuffer(document));
}
