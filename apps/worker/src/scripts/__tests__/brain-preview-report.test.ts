import { describe, expect, it } from 'vitest';

import {
  PreviewUsageError,
  dropRate,
  parsePreviewOptions,
  renderRow,
  renderTotals,
  totalsOf,
  type PreviewRow,
} from '../brain-preview-report.js';

const HASH = `sha256:${'a'.repeat(64)}`;

const extracted: PreviewRow = {
  fileId: 'f1',
  fileName: 'regulamin.pdf',
  result: {
    status: 'extracted',
    tokens: 1200,
    source: { fileName: 'regulamin.pdf', documentVersionId: 'v1' },
    assembled: {
      pages: [
        {
          slug: 'wdrozenie',
          title: 'Wdrożenie',
          type: 'PROCESS',
          content: '# Wdrożenie',
          contentHash: HASH,
          accessibleBy: ['team:hr'],
          sources: [
            {
              fileId: 'f1',
              documentVersionId: 'v1',
              span: '§2',
              quote: 'q1',
              hash: HASH,
            },
            {
              fileId: 'f1',
              documentVersionId: 'v1',
              span: '§3',
              quote: 'q2',
              hash: HASH,
            },
          ],
        },
      ],
      edges: [
        {
          fromSlug: 'wdrozenie',
          toSlug: 'it',
          kind: 'wymaga',
          origin: 'INFERRED',
        },
      ],
      unverifiedClaims: 2,
      unverified: [
        {
          entityTitle: 'Wdrożenie',
          statement: 'S1',
          quote: 'paraphrased one',
          locator: '§2',
        },
        {
          entityTitle: 'Premie',
          statement: 'S2',
          quote: 'invented two',
          locator: '',
        },
      ],
    },
    rejectedItems: 1,
  },
};
const failed: PreviewRow = {
  fileId: 'f2',
  fileName: 'scan.pdf',
  result: {
    status: 'failed',
    tokens: 300,
    reason: 'entities: invalid_type',
    windowIndex: 0,
  },
};
const exhausted: PreviewRow = {
  fileId: 'f3',
  fileName: 'big.pdf',
  result: { status: 'budget_exhausted', tokens: 0 },
};

describe('parsePreviewOptions', () => {
  const parse = (argv: string[], env: Record<string, string> = {}) =>
    parsePreviewOptions(argv, env, 5000);

  it('defaults to a ten-document dry run on the job budget', () => {
    expect(parse(['--org', 'o1'])).toEqual({
      orgId: 'o1',
      projectId: undefined,
      fileIds: [],
      limit: 10,
      maxTokens: 5000,
      json: undefined,
      write: false,
      showDropped: 3,
    });
  });

  it('reads the organization from the environment', () => {
    expect(parse([], { BRAIN_PREVIEW_ORG_ID: 'o2' }).orgId).toBe('o2');
  });

  it('collects every --file', () => {
    expect(parse(['--org', 'o', '--file', 'a', '--file', 'b']).fileIds).toEqual(
      ['a', 'b'],
    );
  });

  it.each([
    [[], '--org is required'],
    [['--org'], '--org needs a value'],
    [['--org', 'o', '--limit', '0'], '--limit must be at least 1'],
    [
      ['--org', 'o', '--limit', 'ten'],
      '--limit must be a non-negative integer',
    ],
    [['--org', 'o', '--wirte'], 'unknown option --wirte'],
  ])('refuses %j', (argv, message) => {
    expect(() => parse(argv)).toThrow(PreviewUsageError);
    expect(() => parse(argv)).toThrow(message);
  });

  // A typo of --write must not quietly become a dry run the reader thinks
  // was written — the unknown-option check is what refuses it.
  it('is a write only when asked exactly', () => {
    expect(parse(['--org', 'o', '--write']).write).toBe(true);
  });
});

describe('totalsOf', () => {
  it('adds up what every document produced', () => {
    const totals = totalsOf([extracted, failed, exhausted], 1);
    expect(totals).toEqual({
      documents: 4,
      extracted: 1,
      failed: 1,
      notAttempted: 2,
      pages: 1,
      keptClaims: 2,
      droppedClaims: 2,
      rejectedItems: 1,
      edges: { EXTRACTED: 0, INFERRED: 1, AMBIGUOUS: 0 },
      tokens: 1500,
    });
  });

  it('computes the drop rate over claims the model offered', () => {
    expect(dropRate(totalsOf([extracted], 0))).toBe(0.5);
  });

  it('has no drop rate when nothing was offered', () => {
    expect(dropRate(totalsOf([failed], 0))).toBeNull();
  });
});

describe('renderRow', () => {
  it('shows pages, access, edges and the dropped claims', () => {
    const text = renderRow(extracted, 3);
    expect(text).toContain(
      '1 pages · 2 claims kept · 2 dropped · 1 malformed · 1 edges · 1200 tokens',
    );
    expect(text).toContain('[PROCESS] Wdrożenie  (2 sources, access: team:hr)');
    expect(text).toContain('wdrozenie —wymaga→ it  [INFERRED]');
    expect(text).toContain('× Premie: S2');
    expect(text).toContain('„invented two”');
  });

  it('caps the dropped claims shown', () => {
    const text = renderRow(extracted, 1);
    expect(text).toContain('… and 1 more');
    expect(text).not.toContain('invented two');
  });

  it('names a failure and where it happened', () => {
    expect(renderRow(failed, 3)).toContain(
      'FAILED at window 0: entities: invalid_type (300 tokens)',
    );
  });

  it('says a document was not attempted, not that it failed', () => {
    expect(renderRow(exhausted, 3)).toContain('not attempted');
  });

  it('shows a page nobody can read as such', () => {
    const row = structuredClone(extracted);
    if (row.result.status === 'extracted') {
      row.result.assembled.pages[0]!.accessibleBy = [];
    }
    expect(renderRow(row, 0)).toContain('access: nobody');
  });
});

describe('renderTotals', () => {
  it('reports the drop rate and whether anything was written', () => {
    const text = renderTotals(totalsOf([extracted], 0), false);
    expect(text).toContain('2 kept, 2 dropped — drop rate 50.0%');
    expect(text).toContain('written: no (dry run');
  });
});
