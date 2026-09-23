import { describe, expect, it } from 'vitest';

import { accessEntries, principalIds } from '../utils/access-entries';
import { canUseBrain } from '../utils/can-use-brain';
import {
  contradictionSourceIds,
  staleFileIds,
  summarizeFinding,
} from '../utils/summarize-finding';

const ORG = 'org-1';
const noNames = { users: new Map(), teams: new Map() };

describe('canUseBrain', () => {
  it.each([
    ['owner', true, true],
    ['admin', true, true],
    ['member', true, false],
    [null, true, false],
    ['owner', false, false],
  ])('%s with the flag %s → %s', (role, enabled, allowed) => {
    expect(canUseBrain({ role, enabled })).toBe(allowed);
  });
});

describe('accessEntries', () => {
  it('names each principal, in order, exactly', () => {
    expect(
      accessEntries(ORG, [`org:${ORG}`, 'user:u1', 'team:t1'], {
        users: new Map([['u1', 'Anna']]),
        teams: new Map([['t1', 'HR']]),
      }),
    ).toEqual([
      { kind: 'organization' },
      { kind: 'user', id: 'u1', name: 'Anna' },
      { kind: 'team', id: 't1', name: 'HR' },
    ]);
  });

  // Rule 22: never a label wider than what retrieval enforces.
  it('shows another organization, or a malformed string, as matching nobody', () => {
    expect(
      accessEntries(ORG, ['org:other', 'group:x', 'team :y'], noNames),
    ).toEqual([
      { kind: 'unmatched', principal: 'org:other' },
      { kind: 'unmatched', principal: 'group:x' },
      { kind: 'unmatched', principal: 'team :y' },
    ]);
  });

  it('keeps a person or team it cannot name, without inventing a name', () => {
    expect(accessEntries(ORG, ['user:gone', 'team:gone'], noNames)).toEqual([
      { kind: 'user', id: 'gone', name: null },
      { kind: 'team', id: 'gone', name: null },
    ]);
  });

  it('is empty for no principals', () => {
    expect(accessEntries(ORG, [], noNames)).toEqual([]);
  });

  it('collects the ids to look up, once each', () => {
    expect(
      principalIds([`org:${ORG}`, 'user:u1', 'team:t1', 'user:u1']),
    ).toEqual({ userIds: ['u1'], teamIds: ['t1'] });
  });
});

describe('summarizeFinding', () => {
  const lookups = {
    quotes: new Map([
      [10, 'Urlop wynosi 26 dni.'],
      [20, 'Urlop wynosi 20 dni.'],
    ]),
    fileNames: new Map([['f1', 'regulamin.pdf']]),
  };

  it('turns a contradiction into its two passages and the explanation', () => {
    const detail = {
      fingerprint: '10:20',
      pairs: [
        { aSourceId: 10, bSourceId: 20, explanation: '26 wobec 20 dni.' },
      ],
    };
    expect(contradictionSourceIds(detail)).toEqual([10, 20]);
    expect(summarizeFinding('CONTRADICTION', detail, lookups)).toEqual({
      kind: 'contradiction',
      pairs: [
        {
          a: 'Urlop wynosi 26 dni.',
          b: 'Urlop wynosi 20 dni.',
          explanation: '26 wobec 20 dni.',
        },
      ],
    });
  });

  it('names the files a stale finding is about', () => {
    const detail = {
      rule: 'stale',
      reasons: [
        { kind: 'source_deleted', sourceId: 1, fileId: 'f1' },
        {
          kind: 'quote_gone',
          sourceId: 2,
          fileId: 'gone',
          pinnedVersionId: 'a',
          activeVersionId: 'b',
        },
        { kind: 'verification_due', dueAt: '2026-09-15T00:00:00.000Z' },
      ],
    };
    expect(staleFileIds(detail)).toEqual(['f1', 'gone']);
    expect(summarizeFinding('STALE', detail, lookups)).toEqual({
      kind: 'stale',
      reasons: [
        { kind: 'source_deleted', fileName: 'regulamin.pdf' },
        { kind: 'quote_gone', fileName: null },
        { kind: 'verification_due', dueAt: '2026-09-15T00:00:00.000Z' },
      ],
    });
  });

  it('tells an owner who left from no owner at all', () => {
    expect(
      summarizeFinding(
        'UNOWNED',
        { rule: 'owner_left', ownerId: 'u' },
        lookups,
      ),
    ).toEqual({
      kind: 'unowned',
      ownerLeft: true,
    });
    expect(summarizeFinding('UNOWNED', { rule: 'no_owner' }, lookups)).toEqual({
      kind: 'unowned',
      ownerLeft: false,
    });
  });

  it('carries an extraction failure’s reason', () => {
    expect(
      summarizeFinding(
        'EXTRACTION_FAILED',
        { reason: 'the call failed (TypeError)', windowIndex: 0, runId: 'r' },
        lookups,
      ),
    ).toEqual({
      kind: 'extraction_failed',
      reason: 'the call failed (TypeError)',
    });
  });

  // A detail an older worker wrote must not take the page down.
  it('reads a detail it does not recognise as no detail', () => {
    expect(summarizeFinding('CONTRADICTION', null, lookups)).toEqual({
      kind: 'unknown',
    });
    expect(summarizeFinding('STALE', { reasons: 'x' }, lookups)).toEqual({
      kind: 'unknown',
    });
    expect(summarizeFinding('EXTRACTION_FAILED', 42, lookups)).toEqual({
      kind: 'extraction_failed',
      reason: null,
    });
    expect(contradictionSourceIds({ pairs: [{ aSourceId: 'x' }] })).toEqual([]);
  });
});
