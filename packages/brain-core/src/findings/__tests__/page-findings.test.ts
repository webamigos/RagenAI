import { describe, expect, it } from 'vitest';

import {
  detectPageFindings,
  type FindingsSnapshot,
  type SnapshotPage,
  type SnapshotSource,
} from '../page-findings';

const NOW = new Date('2026-09-23T12:00:00Z');

function page(id: number, over: Partial<SnapshotPage> = {}): SnapshotPage {
  return {
    id,
    type: 'POLICY',
    status: 'APPROVED',
    ownerId: 'u-owner',
    verifyEvery: null,
    lastVerifiedAt: null,
    approvedAt: new Date('2026-09-01T00:00:00Z'),
    publishedAt: null,
    ...over,
  };
}

function source(
  id: number,
  pageId: number,
  over: Partial<SnapshotSource> = {},
): SnapshotSource {
  return {
    id,
    pageId,
    fileId: 'f1',
    documentVersionId: 'v1',
    quote: 'Urlop wypoczynkowy przysługuje w wymiarze 26 dni.',
    sourceDeletedAt: null,
    ...over,
  };
}

function snapshot(over: Partial<FindingsSnapshot> = {}): FindingsSnapshot {
  return {
    pages: [page(1), page(2)],
    edges: [{ fromPageId: 1, toPageId: 2 }],
    sources: [source(10, 1), source(20, 2)],
    files: new Map([['f1', { activeVersionId: 'v1', activeText: null }]]),
    members: new Set(['u-owner']),
    ...over,
  };
}

const types = (s: FindingsSnapshot) =>
  detectPageFindings(s, NOW).map((f) => `${f.type}:${f.pageIds[0]}`);

describe('detectPageFindings', () => {
  it('finds nothing on owned, linked, current pages', () => {
    expect(detectPageFindings(snapshot(), NOW)).toEqual([]);
  });

  it('judges curated pages only — a candidate is the review queue’s', () => {
    const s = snapshot({
      pages: [page(1, { status: 'CANDIDATE', ownerId: null }), page(2)],
      edges: [],
    });
    expect(types(s)).toEqual(['ORPHAN:2']);
  });

  describe('UNOWNED', () => {
    it('is raised for a page nobody vouches for', () => {
      const s = snapshot({ pages: [page(1, { ownerId: null }), page(2)] });
      const [finding] = detectPageFindings(s, NOW);
      expect(finding).toMatchObject({
        type: 'UNOWNED',
        pageIds: [1],
        severity: 'MEDIUM',
        detail: { rule: 'no_owner' },
      });
    });

    // The case a null check misses: the owner is set and has left.
    it('is raised when the owner is no longer a member', () => {
      const s = snapshot({ members: new Set(['someone-else']) });
      expect(detectPageFindings(s, NOW)).toEqual([
        expect.objectContaining({
          type: 'UNOWNED',
          pageIds: [1],
          detail: expect.objectContaining({
            rule: 'owner_left',
            ownerId: 'u-owner',
          }),
        }),
        expect.objectContaining({ type: 'UNOWNED', pageIds: [2] }),
      ]);
    });

    it('is HIGH on a page that is serving in the index', () => {
      const s = snapshot({
        pages: [page(1, { ownerId: null, publishedAt: NOW }), page(2)],
      });
      expect(detectPageFindings(s, NOW)[0].severity).toBe('HIGH');
    });
  });

  describe('STALE', () => {
    it('is raised for a source marked deleted', () => {
      const s = snapshot({
        sources: [source(10, 1, { sourceDeletedAt: NOW }), source(20, 2)],
      });
      expect(detectPageFindings(s, NOW)).toEqual([
        expect.objectContaining({
          type: 'STALE',
          pageIds: [1],
          fileId: 'f1',
          detail: expect.objectContaining({
            reasons: [{ kind: 'source_deleted', sourceId: 10, fileId: 'f1' }],
          }),
        }),
      ]);
    });

    // Phase E writes `sourceDeletedAt`; the rule must not wait for it.
    it('is raised for a source whose file row is gone and was never marked', () => {
      const s = snapshot({
        sources: [source(10, 1, { fileId: 'gone' }), source(20, 2)],
      });
      expect(types(s)).toEqual(['STALE:1']);
    });

    it('is raised when the active version moved on and the quote is gone', () => {
      const s = snapshot({
        files: new Map([
          [
            'f1',
            {
              activeVersionId: 'v2',
              activeText: 'Urlop wypoczynkowy przysługuje w wymiarze 20 dni.',
            },
          ],
        ]),
      });
      const findings = detectPageFindings(s, NOW);
      expect(findings.map((f) => f.type)).toEqual(['STALE', 'STALE']);
      expect(findings[0].detail).toMatchObject({
        reasons: [
          {
            kind: 'quote_gone',
            sourceId: 10,
            pinnedVersionId: 'v1',
            activeVersionId: 'v2',
          },
        ],
      });
    });

    // Re-ingesting the same PDF mints a version with the same words.
    it('is not raised when the version moved on and still contains the quote', () => {
      const s = snapshot({
        files: new Map([
          [
            'f1',
            {
              activeVersionId: 'v2',
              activeText:
                'Wstęp.\n\nUrlop wypoczynkowy przysługuje\nw wymiarze 26 dni.',
            },
          ],
        ]),
      });
      expect(detectPageFindings(s, NOW)).toEqual([]);
    });

    it('does not guess about a file with no active version', () => {
      const s = snapshot({
        files: new Map([['f1', { activeVersionId: null, activeText: null }]]),
      });
      expect(detectPageFindings(s, NOW)).toEqual([]);
    });

    it('is raised when verification is due, counting from approval if never verified', () => {
      const s = snapshot({
        pages: [
          page(1, { verifyEvery: 'P14D' }), // approved 1 Sept → due 15 Sept
          page(2, { verifyEvery: 'P1M' }), // due 1 Oct
        ],
      });
      expect(detectPageFindings(s, NOW)).toEqual([
        expect.objectContaining({
          type: 'STALE',
          pageIds: [1],
          severity: 'MEDIUM',
          fileId: null,
          detail: expect.objectContaining({
            reasons: [
              { kind: 'verification_due', dueAt: '2026-09-15T00:00:00.000Z' },
            ],
          }),
        }),
      ]);
    });

    it('counts from the last verification when there is one', () => {
      const s = snapshot({
        pages: [
          page(1, {
            verifyEvery: 'P14D',
            lastVerifiedAt: new Date('2026-09-20T00:00:00Z'),
          }),
          page(2),
        ],
      });
      expect(detectPageFindings(s, NOW)).toEqual([]);
    });

    it('is one finding per page, whatever the number of reasons', () => {
      const s = snapshot({
        pages: [page(1, { verifyEvery: 'P1D', publishedAt: NOW }), page(2)],
        sources: [
          source(10, 1, { sourceDeletedAt: NOW }),
          source(11, 1, { fileId: 'gone' }),
          source(20, 2),
        ],
      });
      const [finding, ...rest] = detectPageFindings(s, NOW);
      expect(rest).toEqual([]);
      expect(finding.severity).toBe('HIGH');
      // Two files among the reasons, so the finding names none of them.
      expect(finding.fileId).toBeNull();
      expect(finding.detail.fingerprint).toBe(
        'source_deleted:10|source_deleted:11|verification_due:2026-09-02T00:00:00.000Z',
      );
    });
  });

  describe('ORPHAN', () => {
    it('is raised for a page with no edge', () => {
      expect(types(snapshot({ edges: [] }))).toEqual(['ORPHAN:1', 'ORPHAN:2']);
    });

    it('does not count an edge to a page that is not in the snapshot', () => {
      // A rejected page is left out of the snapshot by the loader.
      const s = snapshot({ edges: [{ fromPageId: 1, toPageId: 99 }] });
      expect(types(s)).toEqual(['ORPHAN:1', 'ORPHAN:2']);
    });

    it('does not count a self-loop', () => {
      const s = snapshot({
        edges: [
          { fromPageId: 1, toPageId: 1 },
          { fromPageId: 2, toPageId: 2 },
        ],
      });
      expect(types(s)).toEqual(['ORPHAN:1', 'ORPHAN:2']);
    });

    it('counts an edge to a candidate as a link', () => {
      const s = snapshot({
        pages: [page(1), page(2, { status: 'CANDIDATE' })],
      });
      expect(detectPageFindings(s, NOW)).toEqual([]);
    });
  });

  describe('GAP', () => {
    it('is raised for a process with no role linked to it', () => {
      const s = snapshot({ pages: [page(1, { type: 'PROCESS' }), page(2)] });
      expect(types(s)).toEqual(['GAP:1']);
    });

    it('is not raised when a role is linked, in either direction', () => {
      const s = snapshot({
        pages: [page(1, { type: 'PROCESS' }), page(2, { type: 'ROLE' })],
        edges: [{ fromPageId: 2, toPageId: 1 }],
      });
      expect(detectPageFindings(s, NOW)).toEqual([]);
    });

    it('is raised alongside ORPHAN for an unlinked process', () => {
      const s = snapshot({
        pages: [page(1, { type: 'PROCESS' })],
        edges: [],
        sources: [source(10, 1)],
      });
      expect(types(s)).toEqual(['ORPHAN:1', 'GAP:1']);
    });
  });
});
