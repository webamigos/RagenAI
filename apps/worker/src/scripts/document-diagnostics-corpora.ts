/* eslint-disable no-console */
/**
 * Run the document diagnostics on the Phase A corpora, in each parse shape
 * (spec 2026-09-26-rag-readiness-score-review, C4).
 *
 *   # every shape but one, then the one that needs table chunks at load time
 *   npx tsx --env-file=.env.local apps/worker/src/scripts/document-diagnostics-corpora.ts \
 *     --json /tmp/diag-a.json
 *   FEATURE_FLAG_TABLE_CHUNKS=1 npx tsx --env-file=.env.local \
 *     apps/worker/src/scripts/document-diagnostics-corpora.ts \
 *     --shapes docling-table-chunks --json /tmp/diag-b.json
 *   npx tsx apps/worker/src/scripts/document-diagnostics-corpora.ts \
 *     --report /tmp/diag-a.json /tmp/diag-b.json --out <results>.md
 *
 * The worker's own loaders and `splitText`, not a copy of them: the corpus
 * file is placed where `ensureLocalFile` looks first, so `loadDocling`,
 * `loadText` and `loadXlsx` run unchanged and never reach S3. No model call —
 * Docling parses locally and these loaders call nothing else — so a run costs
 * nothing, which is why C4 can be run on every threshold change.
 *
 * Two shapes are built rather than loaded, because ingest refuses or cannot
 * produce them: `raw-xml` is the XLSX read as its worksheet XML (the #1347
 * defect), and `partial-markup` is a prose document with one XML part in it.
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { findUndecodableText } from '@ragenai/rag-core/undecodable-text';
// The default export: under ESM the namespace object has no `CFB`, which is
// the only part of SheetJS that opens the container rather than the workbook.
import XLSX from 'xlsx';

import { loadDocling } from '../activities/loaders/load-docling.js';
import { loadText } from '../activities/loaders/load-text.js';
import { loadXlsx } from '../activities/loaders/load-xlsx.js';
import { splitText } from '../activities/splitters/split-documents.js';
import { TABLE_CHUNKS_ENABLED } from '../consts.js';
import {
  computeDocumentDiagnostics,
  type DiagnosticsParse,
} from '../services/document-diagnostics.js';
import { localPathFor } from '../services/ensure-local-file.js';
import type { Document } from '../types/Document.js';
import { FileType } from '../types/UserFile.js';
import { TMP_DIR } from '../utils/cleanup-tmp.js';
import { CHUNK_SETTINGS } from '../utils/splitters.js';
import {
  missingShapes,
  renderReport,
  type ShapeRow,
} from './document-diagnostics-report.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const BENCHMARK = path.join(REPO_ROOT, 'apps/web/evals/rag-benchmark');
const CORPORA = {
  tabele: path.join(BENCHMARK, 'corpora/tabele-bilingual-v1/docs'),
  kolej: path.join(BENCHMARK, 'corpora/kolej-bilingual-v1/docs'),
  'kolej-optimized': path.join(
    BENCHMARK,
    'results/2026-09-27-kolej-optimized/docs',
  ),
} as const;

const ALL_SHAPES = [
  'tabele/docling',
  'tabele/legacy',
  'tabele/docling-table-chunks',
  'kolej/docling',
  'kolej/legacy',
  'kolej-optimized/docling',
  'kolej-optimized/version-text',
  'tabele/raw-xml',
  'kolej/partial-markup',
] as const;

function option(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fileTypeOf(file: string): FileType {
  return file.endsWith('.xlsx') ? FileType.XLSX : FileType.MARKDOWN;
}

async function filesOf(corpus: keyof typeof CORPORA): Promise<string[]> {
  return (await readdir(CORPORA[corpus]))
    .filter((f) => f.endsWith('.md') || f.endsWith('.xlsx'))
    .sort();
}

/** Where `ensureLocalFile` looks before it would reach for S3. */
function stage(source: string, fileId: string, fileName: string) {
  mkdirSync(TMP_DIR, { recursive: true });
  copyFileSync(source, localPathFor({ orgId: 'c4', fileId, fileName }));
}

async function diagnose(
  corpus: string,
  shape: string,
  file: string,
  rawDocs: Document[],
  fileType: FileType,
  parse: DiagnosticsParse,
): Promise<ShapeRow> {
  const chunks = await splitText({
    fileType,
    rawDocs,
    splitterSettings: CHUNK_SETTINGS[fileType],
    parsedWithDocling: parse.parser === 'docling',
  });
  return {
    corpus,
    shape,
    file,
    ingestRefuses: findUndecodableText(
      rawDocs.map((d) => d.pageContent).join('\n'),
    ),
    diagnostics: computeDocumentDiagnostics(chunks, fileType, parse),
  };
}

/** The XLSX's worksheet and shared strings, as a text loader once read them. */
function worksheetXml(xlsxPath: string): string {
  const container = XLSX.CFB.read(readFileSync(xlsxPath), { type: 'buffer' });
  // Leading slash: CFB resolves a part under its root entry only that way.
  // Shared strings are absent from a workbook written with inline strings,
  // which is what this corpus's spreadsheet — and the demo's — is.
  return ['/xl/sharedStrings.xml', '/xl/worksheets/sheet1.xml']
    .map((part) => XLSX.CFB.find(container, part)?.content)
    .filter((content): content is NonNullable<typeof content> => !!content)
    .map((content) => Buffer.from(content as Uint8Array).toString('utf8'))
    .join('\n');
}

async function runShape(key: (typeof ALL_SHAPES)[number]): Promise<ShapeRow[]> {
  const [corpus, shape] = key.split('/') as [keyof typeof CORPORA, string];
  const rows: ShapeRow[] = [];

  for (const file of await filesOf(corpus)) {
    const source = path.join(CORPORA[corpus], file);
    const fileType = fileTypeOf(file);
    const fileId = `c4-${corpus}-${shape}-${path.parse(file).name}`;
    const locator = { orgId: 'c4', fileId, fileName: file };

    if (shape === 'docling' || shape === 'docling-table-chunks') {
      stage(source, fileId, file);
      const rawDocs = await loadDocling({ ...locator, fileType });
      rows.push(
        await diagnose(corpus, shape, file, rawDocs, fileType, {
          parser: 'docling',
          doclingExpected: true,
        }),
      );
    } else if (shape === 'legacy') {
      stage(source, fileId, file);
      const rawDocs =
        fileType === FileType.XLSX
          ? await loadXlsx(locator)
          : await loadText(locator);
      rows.push(
        await diagnose(corpus, shape, file, rawDocs, fileType, {
          parser: 'legacy',
          doclingExpected: false,
        }),
      );
    } else if (shape === 'version-text') {
      // What `reindexDocumentVersion` does: the version's text, as Markdown.
      const rawDocs = [
        { pageContent: readFileSync(source, 'utf8'), metadata: {} },
      ];
      rows.push(
        await diagnose(corpus, shape, file, rawDocs, FileType.MARKDOWN, {
          parser: 'version-text',
          doclingExpected: false,
        }),
      );
    } else if (shape === 'raw-xml' && fileType === FileType.XLSX) {
      const rawDocs = [{ pageContent: worksheetXml(source), metadata: {} }];
      rows.push(
        await diagnose(corpus, shape, file, rawDocs, FileType.TEXT, {
          parser: 'legacy',
          doclingExpected: false,
        }),
      );
    } else if (shape === 'partial-markup' && file.startsWith('en-01')) {
      const xlsx = path.join(CORPORA.tabele, 'pl-03-rejestr-wytopow.xlsx');
      const prose = readFileSync(source, 'utf8');
      const middle = Math.floor(prose.length / 2);
      const breakAt = prose.indexOf('\n\n', middle);
      const at = breakAt === -1 ? middle : breakAt;
      const withPart = `${prose.slice(0, at)}\n\n${worksheetXml(xlsx).slice(0, 1600)}\n\n${prose.slice(at)}`;
      const rawDocs = [{ pageContent: withPart, metadata: {} }];
      rows.push(
        await diagnose(corpus, shape, file, rawDocs, FileType.MARKDOWN, {
          parser: 'legacy',
          doclingExpected: false,
        }),
      );
    }
  }
  return rows;
}

async function main() {
  const reportInputs = process.argv.includes('--report')
    ? process.argv
        .slice(process.argv.indexOf('--report') + 1)
        .filter((arg) => arg.endsWith('.json'))
    : null;

  if (reportInputs) {
    const rows = reportInputs.flatMap(
      (input) => JSON.parse(readFileSync(input, 'utf8')) as ShapeRow[],
    );
    // A final report covers every shape, or it is not one (see missingShapes).
    const missing = missingShapes(rows, ALL_SHAPES);
    if (missing.length > 0) {
      throw new Error(
        `The report is missing ${missing.join(', ')}. Run the table-chunks ` +
          `shape with FEATURE_FLAG_TABLE_CHUNKS=1 and pass both JSON files.`,
      );
    }
    const commit = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT })
      .toString()
      .trim();
    const text = renderReport(rows, {
      date: new Date().toISOString().slice(0, 10),
      commit,
    });
    const out = option('--out');
    if (out) {
      writeFileSync(out, text);
      console.log(`Wrote ${out} (${rows.length} rows)`);
    } else {
      console.log(text);
    }
    return;
  }

  const requested = option('--shapes')?.split(',');
  const shapes = ALL_SHAPES.filter((key) => {
    const shape = key.split('/')[1];
    if (requested) {
      return requested.includes(shape) || requested.includes(key);
    }
    return shape !== 'docling-table-chunks';
  });
  // The flag is read when `docling-client` loads, so one process can produce
  // table chunks or not, never both — hence two runs.
  const needsTableChunks = shapes.some((k) =>
    k.endsWith('docling-table-chunks'),
  );
  if (needsTableChunks !== TABLE_CHUNKS_ENABLED && shapes.length > 0) {
    const want = needsTableChunks ? '1' : '0';
    throw new Error(
      `These shapes need FEATURE_FLAG_TABLE_CHUNKS=${want}; this process has ` +
        `${TABLE_CHUNKS_ENABLED ? '1' : '0'}. Run the table-chunks shape on its own.`,
    );
  }

  const rows: ShapeRow[] = [];
  for (const key of shapes) {
    const shapeRows = await runShape(key);
    console.log(`${key}: ${shapeRows.length} files`);
    rows.push(...shapeRows);
  }

  const out = option('--json');
  if (out) {
    writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log(`Wrote ${out}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
