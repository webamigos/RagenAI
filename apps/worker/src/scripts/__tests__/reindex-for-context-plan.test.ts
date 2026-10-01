import { describe, expect, it } from 'vitest';

import {
  countByVersion,
  fileContextVersions,
  parseReindexArgs,
  planReindex,
  renderVersionCounts,
  type ReindexCandidate,
} from '../reindex-for-context-plan.js';

const point = (metadata: Record<string, unknown>) => ({
  payload: { metadata },
});

describe('parseReindexArgs', () => {
  it('needs an organization', () => {
    expect(() => parseReindexArgs(['--dry-run'])).toThrow('--org');
    expect(() => parseReindexArgs(['--org'])).toThrow('--org needs a value');
  });

  it('reads the dry run and the limit', () => {
    expect(
      parseReindexArgs(['--org', 'o-1', '--dry-run', '--limit', '5']),
    ).toEqual({ orgId: 'o-1', dryRun: true, limit: 5 });
    expect(parseReindexArgs(['--org', 'o-1']).limit).toBe(Infinity);
  });

  it('refuses a limit that is not a positive whole number', () => {
    expect(() => parseReindexArgs(['--org', 'o', '--limit', '0'])).toThrow();
    expect(() => parseReindexArgs(['--org', 'o', '--limit', '2.5'])).toThrow();
  });
});

describe('fileContextVersions', () => {
  it('takes the lowest version over a file’s body chunks, none being 0', () => {
    const versions = fileContextVersions([
      point({ file_id: 'a', context_version: 1 }),
      point({ file_id: 'a', context_version: 1 }),
      point({ file_id: 'b', context_version: 1 }),
      point({ file_id: 'b' }),
      point({ file_id: 'c' }),
    ]);
    expect(Object.fromEntries(versions)).toEqual({ a: 1, b: 0, c: 0 });
  });

  it('ignores the summary chunk, which is never prefixed, and points with no file', () => {
    const versions = fileContextVersions([
      point({ file_id: 'a', context_version: 1 }),
      point({ file_id: 'a', chunk_type: 'summary' }),
      point({ context_version: 1 }),
      { payload: null },
    ]);
    expect(Object.fromEntries(versions)).toEqual({ a: 1 });
  });
});

describe('countByVersion', () => {
  it('counts files per version, lowest first', () => {
    const counts = countByVersion(
      new Map([
        ['a', 1],
        ['b', 0],
        ['c', 1],
      ]),
    );
    expect(counts).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(renderVersionCounts(counts)).toBe(
      '  context_version 0 (none): 1 file\n  context_version 1: 2 files',
    );
  });
});

describe('planReindex', () => {
  const file = (
    id: string,
    activeChangeType: string | null,
    documentId: string | null = `doc-${id}`,
  ): ReindexCandidate => ({
    id,
    fileName: `${id}.pdf`,
    projectId: 'p-1',
    documentId,
    activeChangeType,
  });

  it('re-ingests an unedited file, and re-indexes an edited one from its version', () => {
    const { steps } = planReindex(
      new Map([
        ['up', 0],
        ['edited', 0],
        ['rolled-back', 0],
        ['no-version', 0],
      ]),
      [
        file('up', 'UPLOAD'),
        file('edited', 'MANUAL'),
        file('rolled-back', 'ROLLBACK'),
        file('no-version', null),
      ],
      { current: 1 },
    );
    expect(steps).toEqual([
      { fileId: 'up', job: 'runFileEmbeddings' },
      {
        fileId: 'edited',
        job: 'reindexDocumentVersion',
        fileName: 'edited.pdf',
        projectId: 'p-1',
        documentId: 'doc-edited',
      },
      {
        fileId: 'rolled-back',
        job: 'reindexDocumentVersion',
        fileName: 'rolled-back.pdf',
        projectId: 'p-1',
        documentId: 'doc-rolled-back',
      },
      { fileId: 'no-version', job: 'runFileEmbeddings' },
    ]);
  });

  it('leaves current files alone and skips a file the database does not have', () => {
    const { steps, missing } = planReindex(
      new Map([
        ['current', 1],
        ['gone', 0],
      ]),
      [file('current', 'UPLOAD')],
      { current: 1 },
    );
    expect(steps).toEqual([]);
    expect(missing).toBe(1);
  });

  it('stops at the limit', () => {
    const { steps } = planReindex(
      new Map([
        ['a', 0],
        ['b', 0],
        ['c', 0],
      ]),
      [file('a', 'UPLOAD'), file('b', 'UPLOAD'), file('c', 'UPLOAD')],
      { current: 1, limit: 2 },
    );
    expect(steps.map((s) => s.fileId)).toEqual(['a', 'b']);
  });
});
