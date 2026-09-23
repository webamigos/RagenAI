import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  loadFindingsSnapshot: vi.fn(),
  loadComputedFindings: vi.fn(),
  applyFindingsPlan: vi.fn(),
}));
vi.mock('../../../services/db/brain-findings.js', () => db);

import { reconcileBrainFindings } from '../reconcile-brain-findings.js';

beforeEach(() => {
  vi.clearAllMocks();
  db.loadFindingsSnapshot.mockResolvedValue({
    pages: [
      {
        id: 1,
        type: 'POLICY',
        status: 'APPROVED',
        ownerId: null,
        verifyEvery: null,
        lastVerifiedAt: null,
        approvedAt: null,
        publishedAt: null,
      },
    ],
    edges: [],
    sources: [],
    files: new Map(),
    members: new Set(),
  });
  db.applyFindingsPlan.mockImplementation(async (_org, plan) => ({
    created: plan.create.length,
    updated: plan.update.length,
    resolved: plan.resolve.length,
  }));
});

describe('reconcileBrainFindings', () => {
  // The binding: the rules' output reaches the write, diffed against the rows.
  it('writes what the rules find, minus what is already open', async () => {
    db.loadComputedFindings.mockResolvedValue([
      {
        id: 5,
        type: 'ORPHAN',
        status: 'OPEN',
        pageIds: [1],
        detail: { fingerprint: 'no_links' },
      },
      {
        id: 6,
        type: 'GAP',
        status: 'OPEN',
        pageIds: [9],
        detail: { fingerprint: 'process_without_role' },
      },
    ]);
    const result = await reconcileBrainFindings({ orgId: 'org-1' });

    const [orgId, plan] = db.applyFindingsPlan.mock.calls[0];
    expect(orgId).toBe('org-1');
    expect(plan.create.map((f: { type: string }) => f.type)).toEqual([
      'UNOWNED',
    ]);
    expect(plan.resolve).toEqual([6]);
    expect(result).toEqual({ created: 1, updated: 0, resolved: 1, holding: 2 });
  });
});
