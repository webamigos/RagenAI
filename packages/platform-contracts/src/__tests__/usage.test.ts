import { describe, expect, it } from 'vitest';

import {
  AI_USAGE_SUM_FIELDS,
  joinOrgStorage,
  sumStorage,
  toAiUsageTotals,
  type StorageAggregateRow,
  type UsageOrganization,
} from '../usage/usage';

const ORGS: UsageOrganization[] = [
  { id: 'org-1', name: 'Acme', storageLimitBytes: 1000n },
  { id: 'org-2', name: 'Globex', storageLimitBytes: null },
  { id: 'org-3', name: 'Initech', storageLimitBytes: 500 },
];

const AGGREGATES: StorageAggregateRow[] = [
  { organizationId: 'org-1', totalBytes: 400, fileCount: 4, pageCount: 40 },
  { organizationId: 'org-3', totalBytes: 900, fileCount: 9, pageCount: 90 },
];

describe('joinOrgStorage', () => {
  it('returns every organization, including one with no files', () => {
    const summaries = joinOrgStorage(ORGS, AGGREGATES);

    expect(summaries).toHaveLength(3);
    const globex = summaries.find((s) => s.orgId === 'org-2')!;
    // Zero is a fact worth showing, not a row to drop.
    expect(globex).toMatchObject({
      totalBytes: 0,
      fileCount: 0,
      pageCount: 0,
    });
  });

  it('sorts by bytes descending', () => {
    expect(joinOrgStorage(ORGS, AGGREGATES).map((s) => s.orgId)).toEqual([
      'org-3',
      'org-1',
      'org-2',
    ]);
  });

  // The column is `BigInt`; the two copies differed on whether they converted.
  it('accepts a bigint limit and reports it as a number', () => {
    const acme = joinOrgStorage(ORGS, AGGREGATES).find(
      (s) => s.orgId === 'org-1',
    )!;

    expect(acme.storageLimitBytes).toBe(1000);
    expect(acme.usagePercent).toBe(40);
  });

  it('reports no percentage when there is no ceiling', () => {
    const globex = joinOrgStorage(ORGS, AGGREGATES).find(
      (s) => s.orgId === 'org-2',
    )!;

    expect(globex.storageLimitBytes).toBeNull();
    expect(globex.usagePercent).toBeNull();
  });

  /**
   * A zero limit is not a meaningful ceiling, and dividing by it would give
   * `Infinity` — which renders as "Infinity%" rather than as an error.
   */
  it('treats a zero limit as no ceiling rather than dividing by it', () => {
    const summaries = joinOrgStorage(
      [{ id: 'org-1', name: 'Acme', storageLimitBytes: 0 }],
      AGGREGATES,
    );

    expect(summaries[0]!.usagePercent).toBeNull();
  });

  /**
   * `UserFile.organization` is `onDelete: SetNull`, so an aggregate row can
   * carry a null organization. It must not join to anything.
   */
  it('ignores aggregate rows whose organization was deleted', () => {
    const summaries = joinOrgStorage(ORGS, [
      ...AGGREGATES,
      { organizationId: null, totalBytes: 9999, fileCount: 99, pageCount: 0 },
    ]);

    expect(summaries.reduce((n, s) => n + s.totalBytes, 0)).toBe(1300);
  });

  it('ignores an aggregate row for an organization not in the list', () => {
    const summaries = joinOrgStorage([ORGS[0]!], AGGREGATES);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.totalBytes).toBe(400);
  });
});

describe('sumStorage', () => {
  /**
   * Derived from the summaries, not from the raw aggregates. Summing the
   * aggregates counts organizations that were filtered out, which is how the
   * admin page's totals could disagree with its own table.
   */
  it('totals only the organizations that were joined', () => {
    const summaries = joinOrgStorage([ORGS[0]!], AGGREGATES);

    expect(sumStorage(summaries)).toEqual({
      totalBytes: 400,
      fileCount: 4,
      pageCount: 40,
      overLimitCount: 0,
    });
  });

  it('counts an organization at or over its ceiling', () => {
    const summaries = joinOrgStorage(ORGS, [
      { organizationId: 'org-1', totalBytes: 1000, fileCount: 1, pageCount: 0 },
      { organizationId: 'org-3', totalBytes: 600, fileCount: 1, pageCount: 0 },
    ]);

    // org-1 is exactly at 100%, org-3 is over; org-2 has no ceiling.
    expect(sumStorage(summaries).overLimitCount).toBe(2);
  });

  it('is zero across the board for an empty list', () => {
    expect(sumStorage([])).toEqual({
      totalBytes: 0,
      fileCount: 0,
      pageCount: 0,
      overLimitCount: 0,
    });
  });
});

describe('toAiUsageTotals', () => {
  it('reads a populated aggregate', () => {
    expect(
      toAiUsageTotals({
        _count: 12,
        _sum: {
          inputTokens: 100,
          outputTokens: 200,
          totalTokens: 300,
          estimatedCost: 1.5,
        },
      }),
    ).toEqual({
      requests: 12,
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      estimatedCost: 1.5,
    });
  });

  /**
   * Prisma returns `null` for every `_sum` when nothing matched. Left
   * undefaulted these reach a template as "null", which is why both surfaces
   * were coalescing them by hand at four call sites each.
   */
  it('turns every null sum into zero', () => {
    expect(
      toAiUsageTotals({
        _count: 0,
        _sum: {
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          estimatedCost: null,
        },
      }),
    ).toEqual({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
    });
  });

  it('survives a missing aggregate entirely', () => {
    expect(toAiUsageTotals(null).totalTokens).toBe(0);
    expect(toAiUsageTotals(undefined).requests).toBe(0);
  });
});

describe('AI_USAGE_SUM_FIELDS', () => {
  /**
   * A surface that omits one of these renders a blank rather than failing, so
   * the selection is shared and this asserts it stays complete.
   */
  it('covers every field the totals report', () => {
    expect(Object.keys(AI_USAGE_SUM_FIELDS).sort()).toEqual([
      'estimatedCost',
      'inputTokens',
      'outputTokens',
      'totalTokens',
    ]);
  });
});
