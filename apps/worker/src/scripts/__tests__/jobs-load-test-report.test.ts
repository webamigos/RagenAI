import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  TABLE_HEADER,
  table,
  tableRow,
  writeResults,
  type ReportRow,
} from '../jobs-load-test-report.js';

const run = (overrides: Partial<ReportRow> = {}): ReportRow => ({
  level: 16,
  repetition: 1,
  startMs: 40,
  min: 13_000,
  p50: 60_000,
  p95: 110_000,
  max: 120_000,
  wallMs: 121_000,
  medianQueueWaitMs: 50_000,
  medianParseMs: 18_000,
  medianEmbedMs: 2_500,
  failures: 0,
  ...overrides,
});

describe('tableRow', () => {
  it('has a cell for every column of the header, in its order', () => {
    const row = tableRow(run({ failures: 2 }));

    expect(row.split('|').length).toBe(TABLE_HEADER.split('|').length);
    expect(row).toBe(
      '| 16 | 1 | 40 | 13000 | 60000 | 110000 | 120000 | 121000 | 50000 | 18000 | 2500 | 2 |',
    );
  });

  it('prints a dash for a phase no file reached', () => {
    expect(tableRow(run({ medianParseMs: null }))).toContain('| — |');
  });
});

describe('table', () => {
  it('is the header, a divider and one row per run', () => {
    const lines = table([run(), run({ repetition: 2 })]).split('\n');

    expect(lines[0]).toBe(TABLE_HEADER);
    expect(lines[1]!.split('|').length).toBe(TABLE_HEADER.split('|').length);
    expect(lines).toHaveLength(4);
  });
});

describe('writeResults', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'load-test-report-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('says whether the file holds the whole matrix or the runs so far', async () => {
    const file = path.join(dir, 'result.json');

    await writeResults(file, 'bullmq', [run()], false);
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
      runtime: 'bullmq',
      complete: false,
      results: [{ repetition: 1 }],
    });

    await writeResults(file, 'bullmq', [run(), run({ repetition: 2 })], true);
    const final = JSON.parse(await readFile(file, 'utf8'));
    expect(final.complete).toBe(true);
    expect(final.results).toHaveLength(2);
  });

  it('replaces the report by rename, leaving no partial file behind', async () => {
    const file = path.join(dir, 'result.json');

    await writeResults(file, 'bullmq', [run()], false);
    await writeResults(file, 'bullmq', [run(), run()], false);

    expect(await readdir(dir)).toEqual(['result.json']);
  });
});
