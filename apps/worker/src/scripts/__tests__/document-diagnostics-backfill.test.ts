import type { DocumentDiagnostics } from '../../services/document-diagnostics.js';
import { describe, expect, it } from 'vitest';

import {
  chunksFromPoints,
  parseBackfillArgs,
  qdrantClientOptions,
  renderSummary,
  summariseByType,
  type BackfillRow,
} from '../document-diagnostics-backfill.js';

const point = (
  metadata: Record<string, unknown>,
  text = `chunk ${String(metadata.chunk_index)}`,
) => ({
  payload: { content: text, pageContent: text, metadata },
});

describe('chunksFromPoints', () => {
  it('puts the chunks back in the order they were cut', () => {
    const chunks = chunksFromPoints([
      point({ file_id: 'f', chunk_index: 2 }),
      point({ file_id: 'f', chunk_index: 0 }),
      point({ file_id: 'f', chunk_index: 1 }),
    ]);
    expect(chunks.map((c) => c.pageContent)).toEqual([
      'chunk 0',
      'chunk 1',
      'chunk 2',
    ]);
  });

  it('leaves out the summary chunk, which is the model’s text', () => {
    const chunks = chunksFromPoints([
      point({ chunk_index: 0, chunk_type: 'summary' }, 'A summary.'),
      point({ chunk_index: 1 }),
    ]);
    expect(chunks.map((c) => c.pageContent)).toEqual(['chunk 1']);
  });

  it('gives the checks the splitter’s metadata back: table type and section path', () => {
    const [table, prose] = chunksFromPoints([
      point({ chunk_index: 0, chunk_type: 'table', section_path: 'Rates' }),
      point({ chunk_index: 1, section_path: 'Rates > Zones', page: 3 }),
    ]);
    expect(table.metadata).toEqual({
      chunk_type: 'table',
      sectionPath: 'Rates',
    });
    expect(prose.metadata).toEqual({ sectionPath: 'Rates > Zones' });
  });

  it('reads `content` when a point has no `pageContent`, and survives no payload', () => {
    const chunks = chunksFromPoints([
      { payload: { content: 'older point', metadata: { chunk_index: 0 } } },
      { payload: null },
    ]);
    expect(chunks.map((c) => c.pageContent)).toEqual(['older point', '']);
  });
});

const report = (
  findings: DocumentDiagnostics['findings'],
): DocumentDiagnostics => ({
  version: 1,
  computedAt: '2026-09-27T12:00:00.000Z',
  findings,
  stats: {
    chunkCount: 5,
    tableChunkCount: 0,
    medianChunkChars: 700,
    sectionPathShare: null,
    overlapShare: 0.2,
  },
});

const rows: BackfillRow[] = [
  {
    fileId: '1',
    fileType: 'PDF',
    diagnostics: report([
      { check: 'table-without-header', severity: 'warn' },
      { check: 'over-budget', severity: 'info' },
    ]),
  },
  { fileId: '2', fileType: 'PDF', diagnostics: report([]) },
  {
    fileId: '3',
    fileType: 'DOCX',
    diagnostics: report([{ check: 'over-budget', severity: 'info' }]),
  },
];

describe('summariseByType', () => {
  it('counts files, the ones a badge would mark, and each check', () => {
    expect(summariseByType(rows)).toEqual([
      { fileType: 'DOCX', files: 1, badged: 0, byCheck: { 'over-budget': 1 } },
      {
        fileType: 'PDF',
        files: 2,
        badged: 1,
        byCheck: { 'table-without-header': 1, 'over-budget': 1 },
      },
    ]);
  });

  it('renders a column only for checks that fired', () => {
    const table = renderSummary(summariseByType(rows));
    expect(table).toContain('| PDF | 2 | 1 | 1 | 1 |');
    expect(table).toContain('`table-without-header`');
    expect(table).not.toContain('`markup`');
  });

  it('has no empty column when nothing fired', () => {
    const table = renderSummary(
      summariseByType([
        { fileId: '1', fileType: 'PDF', diagnostics: report([]) },
      ]),
    );
    expect(table.split('\n')).toEqual([
      '| Type | Files | Badged |',
      '| --- | --- | --- |',
      '| PDF | 1 | 0 |',
    ]);
  });
});

describe('parseBackfillArgs', () => {
  it('reads an organization, the two switches, and a limit', () => {
    expect(
      parseBackfillArgs(['--org', 'org-1', '--dry-run', '--limit', '5']),
    ).toEqual({ orgId: 'org-1', dryRun: true, force: false, limit: 5 });
  });

  it('has no limit when --limit is absent', () => {
    expect(parseBackfillArgs(['--org', 'org-1', '--force'])).toEqual({
      orgId: 'org-1',
      dryRun: false,
      force: true,
      limit: Infinity,
    });
  });

  // The case that made a limited trial an unlimited forced overwrite.
  it('refuses a flag where a value belongs', () => {
    expect(() =>
      parseBackfillArgs(['--org', 'org-1', '--limit', '--force']),
    ).toThrow('--limit needs a value');
    expect(() => parseBackfillArgs(['--org', '--dry-run'])).toThrow(
      '--org needs a value',
    );
  });

  it.each(['0', '-3', '2.5', 'ten', String(Number.MAX_SAFE_INTEGER + 2)])(
    'refuses --limit %s',
    (value) => {
      expect(() =>
        parseBackfillArgs(['--org', 'org-1', '--limit', value]),
      ).toThrow('--limit must be a positive whole number');
    },
  );

  it('refuses a missing organization, and a trailing flag with no value', () => {
    expect(() => parseBackfillArgs(['--dry-run'])).toThrow('--org');
    expect(() => parseBackfillArgs(['--org', 'org-1', '--limit'])).toThrow(
      '--limit needs a value',
    );
  });
});

describe('qdrantClientOptions', () => {
  // The client falls back to 6333 when the URL has no port, and `new URL()`
  // drops a scheme's default port — so an https Qdrant behind a proxy was
  // dialled on 6333 and timed out.
  it('dials 443 for an https URL without a port, written with or without it', () => {
    expect(
      qdrantClientOptions('https://qdrant-demo.up.railway.app', undefined),
    ).toMatchObject({ port: 443 });
    expect(
      qdrantClientOptions('https://qdrant-demo.up.railway.app:443', undefined),
    ).toMatchObject({ port: 443 });
  });

  it('keeps an explicit port', () => {
    expect(
      qdrantClientOptions('https://abc.cloud.qdrant.io:6333', 'k'),
    ).toEqual({ url: 'https://abc.cloud.qdrant.io:6333', apiKey: 'k' });
  });

  it("leaves a local Qdrant on the client's default", () => {
    expect(qdrantClientOptions('http://localhost:6333', undefined)).toEqual({
      url: 'http://localhost:6333',
      apiKey: undefined,
    });
    expect(
      qdrantClientOptions('http://localhost', undefined),
    ).not.toHaveProperty('port');
  });

  it('treats an empty API key as none', () => {
    expect(
      qdrantClientOptions('http://localhost:6333', '  ').apiKey,
    ).toBeUndefined();
  });
});
