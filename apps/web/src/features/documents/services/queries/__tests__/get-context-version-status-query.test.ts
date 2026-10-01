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

const row = (
  id: string,
  parsingStatus = 'COMPLETED',
  embeddingStatus = 'COMPLETED',
) => ({ id, parsingStatus, embeddingStatus });

beforeEach(() => findMany.mockReset());

describe('getContextVersionStatusQuery', () => {
  it('counts the files below the current version, across scroll pages', async () => {
    const qdrant = fakeQdrant([
      [point({ file_id: 'a', context_version: 1 }), point({ file_id: 'b' })],
      [point({ file_id: 'c', context_version: 1 }), point({ file_id: 'b' })],
    ]);
    findMany.mockResolvedValue([row('a'), row('b'), row('c')]);

    const status = await getContextVersionStatusQuery(ORG, qdrant as never);

    expect(status).toEqual({
      indexed: 3,
      stale: 1,
      reindexing: 0,
      staleFileIds: ['b'],
    });
    expect(qdrant.scroll).toHaveBeenCalledTimes(2);
    expect(qdrant.scroll.mock.calls[1][1]).toMatchObject({ offset: 'page-1' });
  });

  it('reads only its own organization: its collection, and its rows', async () => {
    const qdrant = fakeQdrant([[point({ file_id: 'a' })]]);
    findMany.mockResolvedValue([row('a')]);

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
    findMany.mockResolvedValue([row('mine')]);

    const status = await getContextVersionStatusQuery(ORG, qdrant as never);

    expect(status).toEqual({
      indexed: 1,
      stale: 1,
      reindexing: 0,
      staleFileIds: ['mine'],
    });
  });

  it('reports nothing indexed when the organization has no collection', async () => {
    const qdrant = fakeQdrant([], false);

    expect(await getContextVersionStatusQuery(ORG, qdrant as never)).toEqual({
      indexed: 0,
      stale: 0,
      reindexing: 0,
      staleFileIds: [],
    });
    expect(qdrant.scroll).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  // A re-index just started leaves the file below the current version until
  // its job finishes; offering it again would queue a second full ingest.
  it('counts a stale file whose ingest is queued or running apart, and never offers it', async () => {
    const qdrant = fakeQdrant([
      [
        point({ file_id: 'idle' }),
        point({ file_id: 'queued' }),
        point({ file_id: 'parsing' }),
        point({ file_id: 'embedding' }),
      ],
    ]);
    findMany.mockResolvedValue([
      row('idle'),
      row('queued', 'NOT_STARTED', 'NOT_STARTED'),
      row('parsing', 'STARTED', 'NOT_STARTED'),
      row('embedding', 'COMPLETED', 'STARTED'),
    ]);

    expect(await getContextVersionStatusQuery(ORG, qdrant as never)).toEqual({
      indexed: 4,
      stale: 1,
      reindexing: 3,
      staleFileIds: ['idle'],
    });
  });
});
