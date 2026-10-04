import { describe, expect, it, vi } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { qdrant } = vi.hoisted(() => ({
  qdrant: {
    collectionExists: vi.fn(async () => ({ exists: true })),
    getCollection: vi.fn(async () => ({ payload_schema: {} })),
    createPayloadIndex: vi.fn(async () => undefined),
    setPayload: vi.fn(
      async (_collection: string, _request: unknown) => undefined,
    ),
  },
}));

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn(function () {
    return qdrant;
  }),
}));

vi.mock('../db/db.js', () => ({ db: {} }));

import { qdrantService } from '../qdrant.js';

/**
 * `accessible_by` is what the retrieval filter reads. These two properties are
 * the whole difference between a sync that works and one that reports success
 * and changes nothing — and both were wrong in the code this replaces (#1245),
 * which no test could see because it had no call site. They were checked
 * against a real Qdrant 1.19 when this was written.
 */
describe('qdrantService.setFileAccess', () => {
  it('writes under the `metadata` key, not to a dotted payload key', async () => {
    await qdrantService.setFileAccess({
      orgId: 'org-1',
      fileId: 'file-1',
      accessibleBy: ['user:a', 'team:t'],
    });

    const [collection, request] = qdrant.setPayload.mock
      .calls[0] as unknown as [
      string,
      { payload: Record<string, unknown>; key: string },
    ];

    expect(collection).toBe('org-1');
    // A payload keyed 'metadata.accessible_by' becomes a literal top-level key
    // with a dot in its name; the filter reads metadata -> accessible_by.
    expect(request.key).toBe('metadata');
    expect(request.payload).toEqual({ accessible_by: ['user:a', 'team:t'] });
  });

  it("matches only this file's points, and never a published Brain page's", async () => {
    await qdrantService.setFileAccess({
      orgId: 'org-1',
      fileId: 'file-1',
      accessibleBy: [],
    });

    const request = qdrant.setPayload.mock.calls.at(-1)?.[1] as unknown as {
      filter: { must: unknown[] };
      wait: boolean;
    };

    expect(request.filter.must).toEqual([
      { key: 'metadata.file_id', match: { value: 'file-1' } },
      // A Brain page's chunks take their access from the page, and the page's
      // publish rewrites it; deriving it from the file row would overwrite it.
      { is_empty: { key: 'metadata.brain_generation' } },
    ]);
    // Waits, so a caller that moves on has not left a window in which the
    // revoked principal still matches.
    expect(request.wait).toBe(true);
  });

  it('writes an empty list as an empty list, which is the answer for a file nobody may reach', async () => {
    await qdrantService.setFileAccess({
      orgId: 'org-1',
      fileId: 'file-1',
      accessibleBy: [],
    });

    const request = qdrant.setPayload.mock.calls.at(-1)?.[1] as unknown as {
      payload: { accessible_by: string[] };
    };

    expect(request.payload.accessible_by).toEqual([]);
  });
});
