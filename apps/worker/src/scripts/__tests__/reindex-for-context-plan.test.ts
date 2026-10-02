import { describe, expect, it } from 'vitest';

import {
  parseReindexArgs,
  planReindex,
  renderVersionCounts,
  startReindexSteps,
  type ReindexCandidate,
  type StartStepDeps,
} from '../reindex-for-context-plan.js';

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

describe('renderVersionCounts', () => {
  it('prints files per version, lowest first', () => {
    const counts: [number, number][] = [
      [0, 1],
      [1, 2],
    ];
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

describe('startReindexSteps', () => {
  type State = { status: string; workflowId: string };
  const previous: State = { status: 'COMPLETED', workflowId: 'old-run' };

  function deps(overrides: Partial<StartStepDeps<State>> = {}) {
    const writes: string[] = [];
    let n = 0;
    const base: StartStepDeps<State> = {
      newWorkflowId: () => `run-${++n}`,
      readState: async () => ({ ...previous }),
      reset: async (fileId, id) => {
        writes.push(`reset ${fileId} ${id}`);
      },
      restore: async (fileId, state, id) => {
        writes.push(`restore ${fileId} ${state.status} if ${id}`);
      },
      start: async (step, id) => {
        writes.push(`start ${step.fileId} ${id}`);
      },
    };
    return { deps: { ...base, ...overrides }, writes };
  }

  const steps = [
    { fileId: 'f-1', job: 'runFileEmbeddings' as const },
    { fileId: 'f-2', job: 'runFileEmbeddings' as const },
  ];

  it('resets each row with its run id before starting it', async () => {
    const { deps: d, writes } = deps();
    expect(await startReindexSteps(steps, d)).toEqual({
      started: 2,
      failed: [],
    });
    expect(writes).toEqual([
      'reset f-1 run-1',
      'start f-1 run-1',
      'reset f-2 run-2',
      'start f-2 run-2',
    ]);
  });

  it('puts the previous status back when a start fails, and goes on', async () => {
    const boom = new Error('redis unreachable');
    const { deps: d, writes } = deps({
      start: async (step, id) => {
        if (step.fileId === 'f-1') {
          throw boom;
        }
        writes.push(`start ${step.fileId} ${id}`);
      },
    });
    const report = await startReindexSteps(steps, d);
    expect(report.started).toBe(1);
    expect(report.failed).toEqual([{ fileId: 'f-1', error: boom }]);
    expect(writes).toEqual([
      'reset f-1 run-1',
      // Conditional on the row still carrying the failed run's id.
      'restore f-1 COMPLETED if run-1',
      'reset f-2 run-2',
      'start f-2 run-2',
    ]);
  });

  it('reports a restore that failed alongside the start error', async () => {
    const { deps: d } = deps({
      start: async () => {
        throw new Error('start');
      },
      restore: async () => {
        throw new Error('restore');
      },
    });
    const report = await startReindexSteps([steps[0]], d);
    expect(report.failed[0].error).toBeInstanceOf(AggregateError);
  });

  it('skips a file whose row is gone without writing to it', async () => {
    const { deps: d, writes } = deps({ readState: async () => null });
    expect(await startReindexSteps([steps[0]], d)).toEqual({
      started: 0,
      failed: [{ fileId: 'f-1', error: 'no file row' }],
    });
    expect(writes).toEqual([]);
  });
});
