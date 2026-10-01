import { describe, expect, it } from 'vitest';

import {
  chunksByIndexFilter,
  orderByChunkIndex,
  wantedChunkIndexes,
} from '../selection/chunks-by-index';

const query = { orgId: 'org-1', fileId: 'file-1', indexes: [4, 2, 3] };

describe('chunksByIndexFilter', () => {
  it('asks for the file, the positions and the organization, prose only', () => {
    expect(chunksByIndexFilter(query)).toEqual({
      must: [
        { key: 'metadata.organization_id', match: { value: 'org-1' } },
        { key: 'metadata.file_id', match: { value: 'file-1' } },
        { key: 'metadata.chunk_index', match: { any: [2, 3, 4] } },
      ],
      must_not: [
        { key: 'metadata.chunk_type', match: { any: ['summary', 'table'] } },
      ],
    });
  });

  it('nests the search filter whole, so its should keeps its meaning', () => {
    const search = {
      must: [{ key: 'metadata.accessible_by', match: { any: ['u-1'] } }],
      should: [
        { key: 'metadata.project_id', match: { value: 'p-1' } },
        { key: 'metadata.file_id', match: { any: ['kb-1'] } },
      ],
    };
    const filter = chunksByIndexFilter(query, search) as { must: unknown[] };
    expect(filter.must[0]).toBe(search);
    expect(filter.must).toHaveLength(4);
  });

  it('keeps the organization even when the caller passes no filter', () => {
    const filter = chunksByIndexFilter(query) as { must: unknown[] };
    expect(filter.must).toContainEqual({
      key: 'metadata.organization_id',
      match: { value: 'org-1' },
    });
  });
});

describe('wantedChunkIndexes', () => {
  it('drops duplicates, non-integers and positions below 1, and sorts', () => {
    expect(wantedChunkIndexes([3, 3, 0, -1, 2.5, Number.NaN, 1, 7])).toEqual([
      1, 3, 7,
    ]);
  });
});

describe('orderByChunkIndex', () => {
  const chunk = (index: unknown, text: string) => ({
    pageContent: text,
    metadata: { chunk_index: index },
  });

  it('orders by position and keeps the first of two points at one position', () => {
    const ordered = orderByChunkIndex([
      chunk(5, 'e'),
      chunk(3, 'c'),
      chunk(5, 'e-duplicate'),
      chunk('4', 'not a number'),
    ]);
    expect(ordered.map((c) => c.pageContent)).toEqual(['c', 'e']);
  });

  it('leaves a missing position missing', () => {
    expect(
      orderByChunkIndex([chunk(2, 'b'), chunk(4, 'd')]).map(
        (c) => c.metadata.chunk_index,
      ),
    ).toEqual([2, 4]);
  });
});
