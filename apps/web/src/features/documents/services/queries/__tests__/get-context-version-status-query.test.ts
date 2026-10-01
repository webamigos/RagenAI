import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: { userFile: { findMany } },
}));

import { getContextVersionStatusQuery } from '../get-context-version-status-query';

const ORG = 'org-1';

const point = (metadata: Record<string, unknown>) => ({
  id: Math.random(),
  payload: { metadata },
});

function fakeQdrant(pages: ReturnType<typeof point>[][], exists = true) {
  let call = 0;
  return {
    collectionExists: vi.fn(async (_collection: string) => ({ exists })),
    scroll: vi.fn(
      async (_collection: string, _request: { offset?: unknown }) => {
        const points = pages[call] ?? [];
        call += 1;
        return {
          points,
          next_page_offset: call < pages.length ? `page-${call}` : null,
        };
      },
    ),
  };
}

beforeEach(() => findMany.mockReset());

describe('getContextVersionStatusQuery', () => {
  it('counts the files below the current version, across scroll pages', async () => {
    const qdrant = fakeQdrant([
      [point({ file_id: 'a', context_version: 1 }), point({ file_id: 'b' })],
      [point({ file_id: 'c', context_version: 1 }), point({ file_id: 'b' })],
    ]);
    findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    const status = await getContextVersionStatusQuery(ORG, qdrant as never);

    expect(status).toEqual({ indexed: 3, stale: 1, staleFileIds: ['b'] });
    expect(qdrant.scroll).toHaveBeenCalledTimes(2);
    expect(qdrant.scroll.mock.calls[1][1]).toMatchObject({ offset: 'page-1' });
  });

  it('reads only its own organization: its collection, and its rows', async () => {
    const qdrant = fakeQdrant([[point({ file_id: 'a' })]]);
    findMany.mockResolvedValue([{ id: 'a' }]);

    await getContextVersionStatusQuery(ORG, qdrant as never);

    expect(qdrant.collectionExists).toHaveBeenCalledWith(ORG);
    expect(qdrant.scroll.mock.calls[0][0]).toBe(ORG);
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      publishedPages: { none: {} },
    });
  });

  it('leaves out a point with no row — another organization’s or a deleted file', async () => {
    const qdrant = fakeQdrant([
      [point({ file_id: 'mine' }), point({ file_id: 'gone' })],
    ]);
    findMany.mockResolvedValue([{ id: 'mine' }]);

    const status = await getContextVersionStatusQuery(ORG, qdrant as never);

    expect(status).toEqual({ indexed: 1, stale: 1, staleFileIds: ['mine'] });
  });

  it('reports nothing indexed when the organization has no collection', async () => {
    const qdrant = fakeQdrant([], false);

    expect(await getContextVersionStatusQuery(ORG, qdrant as never)).toEqual({
      indexed: 0,
      stale: 0,
      staleFileIds: [],
    });
    expect(qdrant.scroll).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });
});
