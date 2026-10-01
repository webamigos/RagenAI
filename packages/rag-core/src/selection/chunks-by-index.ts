/**
 * Looking a file's chunks up by position (spec
 * 2026-09-29-llm-document-selection, B2) — the filter both apps' Qdrant
 * clients send, declared once so the two cannot drift.
 *
 * `previous_chunk_id` and `next_chunk_id` are positions too (`chunk_index − 2`
 * and `chunk_index`), so a neighbour is found by `file_id` plus its
 * `chunk_index`, which carries an integer payload index since B1.
 */

/**
 * The chunk types a prose hit never expands into: the ADR-16 summary
 * (`chunk_index` 1) and the table chunks the splitter appends after the prose.
 * A prose chunk carries no `chunk_type` at all.
 */
export const NON_PROSE_CHUNK_TYPES = ['summary', 'table'] as const;

export interface ChunksByIndexQuery {
  orgId: string;
  fileId: string;
  indexes: readonly number[];
}

/** The positions worth asking for: integers ≥ 1, once each, in order. */
export function wantedChunkIndexes(indexes: readonly number[]): number[] {
  return [...new Set(indexes)]
    .filter((i) => Number.isInteger(i) && i >= 1)
    .sort((a, b) => a - b);
}

/**
 * The Qdrant filter for `{ orgId, fileId, indexes }`, inside the search's own
 * filter when there is one.
 *
 * The search filter (`organization_id`, `accessible_by`, `project_id` or a
 * knowledge-base `should`) is nested whole, so its `should` keeps its meaning.
 * A neighbour sits in a file that already passed that filter, so applying it
 * again is defence in depth rather than the access check — and so is the
 * explicit `organization_id`, which holds even when a caller passes no filter.
 */
export function chunksByIndexFilter(
  { orgId, fileId, indexes }: ChunksByIndexQuery,
  searchFilter?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    must: [
      ...(searchFilter ? [searchFilter] : []),
      { key: 'metadata.organization_id', match: { value: orgId } },
      { key: 'metadata.file_id', match: { value: fileId } },
      {
        key: 'metadata.chunk_index',
        match: { any: wantedChunkIndexes(indexes) },
      },
    ],
    must_not: [
      {
        key: 'metadata.chunk_type',
        match: { any: [...NON_PROSE_CHUNK_TYPES] },
      },
    ],
  };
}

/**
 * The points a lookup returned, one per position and in file order. A
 * position with no point (deleted by a re-index racing the turn) is simply
 * absent; a position with two (the same race, mid-write) keeps the first.
 */
export function orderByChunkIndex<
  T extends { metadata: Record<string, unknown> },
>(chunks: readonly T[]): T[] {
  const byIndex = new Map<number, T>();
  for (const chunk of chunks) {
    const index = chunk.metadata.chunk_index;
    if (typeof index === 'number' && !byIndex.has(index)) {
      byIndex.set(index, chunk);
    }
  }
  return [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, c]) => c);
}
