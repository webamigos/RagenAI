import { describe, expect, it, vi } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { PAYLOAD_INDEXES } from '@ragenai/rag-core';

import { ensurePayloadIndexes } from '../qdrant.js';

function client(existing: string[]) {
  return {
    getCollection: vi.fn(async () => ({
      payload_schema: Object.fromEntries(existing.map((f) => [f, {}])),
    })),
    createPayloadIndex: vi.fn(async () => undefined),
  };
}

/**
 * Indexes used to be created only with a collection, so one added to the list
 * later — `chunk_index`, for looking neighbours up by position — never
 * reached a collection that already existed.
 */
describe('ensurePayloadIndexes', () => {
  it('creates only the indexes an existing collection lacks', async () => {
    const qdrant = client([
      'metadata.project_id',
      'metadata.file_id',
      'metadata.organization_id',
      'metadata.accessible_by',
    ]);

    const created = await ensurePayloadIndexes(qdrant, 'org-1');

    expect(created).toEqual(['metadata.chunk_index']);
    expect(qdrant.createPayloadIndex).toHaveBeenCalledTimes(1);
    expect(qdrant.createPayloadIndex).toHaveBeenCalledWith('org-1', {
      field_name: 'metadata.chunk_index',
      field_schema: 'integer',
    });
  });

  it('creates every index on a new collection, with its own schema', async () => {
    const qdrant = client([]);
    await ensurePayloadIndexes(qdrant, 'org-1');
    expect(qdrant.createPayloadIndex).toHaveBeenCalledTimes(
      PAYLOAD_INDEXES.length,
    );
    expect(qdrant.createPayloadIndex).toHaveBeenCalledWith('org-1', {
      field_name: 'metadata.accessible_by',
      field_schema: 'keyword',
    });
  });

  it('only reports in a dry run', async () => {
    const qdrant = client([]);
    const missing = await ensurePayloadIndexes(qdrant, 'org-1', {
      dryRun: true,
    });
    expect(missing).toHaveLength(PAYLOAD_INDEXES.length);
    expect(qdrant.createPayloadIndex).not.toHaveBeenCalled();
  });

  it('does nothing to a collection that has them all', async () => {
    const qdrant = client(PAYLOAD_INDEXES.map((i) => i.field));
    expect(await ensurePayloadIndexes(qdrant, 'org-1')).toEqual([]);
    expect(qdrant.createPayloadIndex).not.toHaveBeenCalled();
  });
});
