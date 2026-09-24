import { describe, expect, it } from 'vitest';

import type { DesiredFinding } from '../page-findings';
import { reconcileFindings, type ExistingFinding } from '../reconcile';

function want(
  type: DesiredFinding['type'],
  pageId: number,
  fingerprint = 'no_links',
): DesiredFinding {
  return {
    type,
    pageIds: [pageId],
    fileId: null,
    severity: 'LOW',
    detail: { rule: 'no_links', fingerprint },
  };
}

function row(
  id: number,
  type: string,
  pageId: number,
  status: ExistingFinding['status'] = 'OPEN',
  fingerprint: string | null = 'no_links',
): ExistingFinding {
  return {
    id,
    type,
    status,
    pageIds: [pageId],
    detail: fingerprint === null ? null : { fingerprint },
  };
}

describe('reconcileFindings', () => {
  it('creates what is wanted and not stored', () => {
    expect(reconcileFindings([want('ORPHAN', 1)], [])).toEqual({
      create: [want('ORPHAN', 1)],
      update: [],
      resolve: [],
    });
  });

  it('leaves an open finding that still holds untouched', () => {
    expect(
      reconcileFindings([want('ORPHAN', 1)], [row(5, 'ORPHAN', 1)]),
    ).toEqual({ create: [], update: [], resolve: [] });
  });

  it('updates an open finding whose reasons changed, keeping its id', () => {
    const plan = reconcileFindings(
      [want('STALE', 1, 'source_deleted:10|source_deleted:11')],
      [row(5, 'STALE', 1, 'OPEN', 'source_deleted:10')],
    );
    expect(plan.update).toEqual([
      {
        id: 5,
        finding: want('STALE', 1, 'source_deleted:10|source_deleted:11'),
      },
    ]);
    expect(plan.create).toEqual([]);
  });

  it('re-grades an open finding whose page started serving, keeping its id', () => {
    const wanted = { ...want('STALE', 1), severity: 'HIGH' as const };
    const stored = { ...row(9, 'STALE', 1), severity: 'MEDIUM' };
    expect(reconcileFindings([wanted], [stored]).update).toEqual([
      { id: 9, finding: wanted },
    ]);
  });

  it('resolves an open finding whose condition is gone', () => {
    expect(reconcileFindings([], [row(5, 'UNOWNED', 1)]).resolve).toEqual([5]);
  });

  describe('a dismissal', () => {
    it('stands while the problem is the same', () => {
      expect(
        reconcileFindings(
          [want('ORPHAN', 1)],
          [row(5, 'ORPHAN', 1, 'DISMISSED')],
        ).create,
      ).toEqual([]);
    });

    it('does not cover a different problem on the same page', () => {
      const plan = reconcileFindings(
        [want('STALE', 1, 'source_deleted:10|source_deleted:11')],
        [row(5, 'STALE', 1, 'DISMISSED', 'source_deleted:10')],
      );
      expect(plan.create).toHaveLength(1);
    });

    it('without a fingerprint suppresses nothing', () => {
      const plan = reconcileFindings(
        [want('ORPHAN', 1)],
        [row(5, 'ORPHAN', 1, 'DISMISSED', null)],
      );
      expect(plan.create).toHaveLength(1);
    });
  });

  it('opens a new row when a resolved condition recurs', () => {
    expect(
      reconcileFindings([want('ORPHAN', 1)], [row(5, 'ORPHAN', 1, 'RESOLVED')])
        .create,
    ).toHaveLength(1);
  });

  it('collapses duplicate open rows onto the oldest', () => {
    const plan = reconcileFindings(
      [want('ORPHAN', 1)],
      [row(9, 'ORPHAN', 1), row(5, 'ORPHAN', 1), row(7, 'ORPHAN', 1)],
    );
    expect(plan).toEqual({ create: [], update: [], resolve: [7, 9] });
  });

  // Nothing here can tell whether those conditions still hold.
  it('never touches CONTRADICTION or EXTRACTION_FAILED', () => {
    const plan = reconcileFindings(
      [],
      [
        { ...row(5, 'CONTRADICTION', 1), pageIds: [1, 2] },
        { ...row(6, 'EXTRACTION_FAILED', 1), pageIds: [] },
      ],
    );
    expect(plan).toEqual({ create: [], update: [], resolve: [] });
  });

  it('keys on type and page, so one page carries several types', () => {
    const plan = reconcileFindings(
      [want('ORPHAN', 1), want('GAP', 1, 'process_without_role')],
      [row(5, 'ORPHAN', 1)],
    );
    expect(plan.create.map((f) => f.type)).toEqual(['GAP']);
  });
});
