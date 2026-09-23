import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ knowledgePage: { findMany: vi.fn() } }));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));

const { getMergeTargetsQuery, baseSlug, normalizeTitle } =
  await import('../services/queries/get-merge-targets-query');

beforeEach(() => vi.clearAllMocks());

describe('getMergeTargetsQuery', () => {
  it('offers every live page but this one, same-subject pages first', async () => {
    db.knowledgePage.findMany.mockResolvedValue([
      { publicId: 'a', title: 'Kadry', slug: 'kadry', status: 'APPROVED' },
      {
        publicId: 'b',
        title: 'Urlop  wypoczynkowy',
        slug: 'urlop',
        status: 'APPROVED',
      },
      {
        publicId: 'c',
        title: 'Inny tytuł',
        slug: 'urlop-wypoczynkowy-3',
        status: 'CANDIDATE',
      },
    ]);
    const targets = await getMergeTargetsQuery('org-1', {
      id: 5,
      title: 'Urlop wypoczynkowy',
      slug: 'urlop-wypoczynkowy-2',
    });
    expect(db.knowledgePage.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      id: { not: 5 },
      status: { in: ['CANDIDATE', 'APPROVED', 'STALE'] },
    });
    expect(targets.map((t) => [t.publicId, t.suggested])).toEqual([
      ['b', true],
      ['c', true],
      ['a', false],
    ]);
  });

  it('normalizes titles and strips only a numeric suffix from slugs', () => {
    expect(normalizeTitle('  Urlop\tWYPOCZYNKOWY ')).toBe('urlop wypoczynkowy');
    expect(baseSlug('urlop-2')).toBe('urlop');
    expect(baseSlug('rok-2026-plan')).toBe('rok-2026-plan');
  });
});
