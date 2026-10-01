/**
 * Deterministic context expansion (spec 2026-09-29-llm-document-selection,
 * B3): each kept prose hit is rendered with its ±1 prose neighbours, within a
 * fixed budget, and hits that meet after widening are rendered once.
 *
 * Plain functions with the lookup injected, so both chains call the same code
 * (D4) and tests need no stack. `fetchChunks` is the caller's
 * `getChunksByIndex`, already scoped to the organization and the search
 * filter, and already decoding dual content.
 */

/** A turn renders at most this many times `maxDocuments` chunks in total. */
export const EXPANSION_BUDGET_MULTIPLIER = 3;

/** Neighbours on each side of a hit. Phase C may let a model choose. */
export const EXPANSION_RADIUS = 1;

/**
 * The shortest suffix/prefix match treated as splitter overlap rather than
 * coincidence. The splitters overlap chunks by about 200 characters.
 */
const MIN_OVERLAP_CHARS = 20;
/** The longest overlap looked for — well above the splitters' 200. */
const MAX_OVERLAP_CHARS = 1000;

export interface ExpandableChunk {
  pageContent: string;
  metadata: Record<string, unknown>;
}

export type FetchChunksByIndex<T extends ExpandableChunk> = (
  fileId: string,
  indexes: number[],
) => Promise<T[]>;

/** A kept hit and the chunks rendered with it, the hit included. */
export interface ExpandedSection<T extends ExpandableChunk> {
  hit: T;
  chunks: T[];
}

export interface ExpansionResult<T extends ExpandableChunk> {
  /** One document per rendered section, in the hits' rank order. */
  docs: T[];
  /** Neighbour chunks added across all sections. */
  addedChunks: number;
  /** Files whose neighbour lookup failed; their hits render unexpanded. */
  failedFiles: number;
}

interface Position {
  fileId: string;
  chunkIndex: number;
}

/**
 * The file and position of a hit that can be widened: a prose chunk (no
 * `chunk_type` — not the summary, not a table) with both fields set.
 */
export function expandablePosition(chunk: ExpandableChunk): Position | null {
  const {
    file_id: fileId,
    chunk_index: chunkIndex,
    chunk_type,
  } = chunk.metadata;
  if (
    chunk_type !== undefined ||
    typeof fileId !== 'string' ||
    fileId.length === 0 ||
    typeof chunkIndex !== 'number' ||
    !Number.isInteger(chunkIndex)
  ) {
    return null;
  }
  return { fileId, chunkIndex };
}

/**
 * Which neighbour positions to fetch, per file: hits in rank order, each
 * taking its neighbours while the budget lasts, so a later hit stays
 * unexpanded rather than an earlier one being cut. A position that is already
 * a hit, or already planned, is not fetched twice.
 */
export function planExpansion(
  hits: readonly ExpandableChunk[],
  { budget, radius = EXPANSION_RADIUS }: { budget: number; radius?: number },
): Map<string, number[]> {
  const taken = new Set<string>();
  for (const hit of hits) {
    const position = expandablePosition(hit);
    if (position) {
      taken.add(`${position.fileId}:${position.chunkIndex}`);
    }
  }

  let used = hits.length;
  const plan = new Map<string, number[]>();
  for (const hit of hits) {
    const position = expandablePosition(hit);
    if (!position) {
      continue;
    }
    for (let offset = 1; offset <= radius; offset++) {
      for (const index of [
        position.chunkIndex - offset,
        position.chunkIndex + offset,
      ]) {
        const key = `${position.fileId}:${index}`;
        if (index < 1 || taken.has(key) || used >= budget) {
          continue;
        }
        taken.add(key);
        used++;
        plan.set(position.fileId, [
          ...(plan.get(position.fileId) ?? []),
          index,
        ]);
      }
    }
  }
  return plan;
}

/**
 * Joins two consecutive chunks, dropping the overlap the splitter left
 * between them: the longest suffix of `before` that is a prefix of `after`.
 * Without one, the two are joined by a newline and nothing is dropped.
 */
export function joinTrimmingOverlap(before: string, after: string): string {
  const longest = Math.min(MAX_OVERLAP_CHARS, before.length, after.length);
  for (let length = longest; length >= MIN_OVERLAP_CHARS; length--) {
    if (before.endsWith(after.slice(0, length))) {
      return before + after.slice(length);
    }
  }
  return `${before}\n${after}`;
}

function indexOf(chunk: ExpandableChunk): number {
  return chunk.metadata.chunk_index as number;
}

/**
 * Renders each section as one document, in the hits' rank order.
 *
 * - Chunks of a section are joined in file order with the overlap trimmed.
 * - Two sections of one file that overlap or touch after widening are
 *   merged into the better-ranked one, so no text is rendered twice.
 * - The document keeps its hit's metadata (file, page, score) and gains
 *   `expanded_chunk_indexes`, every position it covers, which is what the
 *   retrieval trace reports.
 */
export function mergeExpanded<T extends ExpandableChunk>(
  sections: readonly ExpandedSection<T>[],
): T[] {
  const merged: { hit: T; byIndex: Map<number, T> }[] = [];
  for (const section of sections) {
    const position = expandablePosition(section.hit);
    if (!position) {
      merged.push({ hit: section.hit, byIndex: new Map() });
      continue;
    }
    const indexes = section.chunks.map(indexOf);
    const low = Math.min(...indexes);
    const high = Math.max(...indexes);
    const into = merged.find(({ hit, byIndex }) => {
      if (
        byIndex.size === 0 ||
        expandablePosition(hit)?.fileId !== position.fileId
      ) {
        return false;
      }
      const theirs = [...byIndex.keys()];
      return low <= Math.max(...theirs) + 1 && high >= Math.min(...theirs) - 1;
    });
    const target = into ?? { hit: section.hit, byIndex: new Map<number, T>() };
    for (const chunk of section.chunks) {
      if (!target.byIndex.has(indexOf(chunk))) {
        target.byIndex.set(indexOf(chunk), chunk);
      }
    }
    if (!into) {
      merged.push(target);
    }
  }

  return merged.map(({ hit, byIndex }) => {
    if (byIndex.size <= 1) {
      return hit;
    }
    const ordered = [...byIndex.entries()].sort(([a], [b]) => a - b);
    let text = ordered[0][1].pageContent;
    for (let i = 1; i < ordered.length; i++) {
      text = joinTrimmingOverlap(text, ordered[i][1].pageContent);
    }
    return {
      ...hit,
      pageContent: text,
      metadata: {
        ...hit.metadata,
        expanded_chunk_indexes: ordered.map(([index]) => index),
      },
    };
  });
}

/**
 * The hits, each widened by its ±1 prose neighbours within
 * `maxDocuments × EXPANSION_BUDGET_MULTIPLIER` chunks, and merged where they
 * meet. One lookup per file, in parallel; a failed lookup leaves that file's
 * hits as they were, and a missing neighbour (deleted by a re-index racing
 * the turn) is simply absent. It never throws.
 */
export async function expandHits<T extends ExpandableChunk>({
  hits,
  maxDocuments,
  fetchChunks,
  radius = EXPANSION_RADIUS,
}: {
  hits: readonly T[];
  maxDocuments: number;
  fetchChunks: FetchChunksByIndex<T>;
  radius?: number;
}): Promise<ExpansionResult<T>> {
  const plan = planExpansion(hits, {
    budget: maxDocuments * EXPANSION_BUDGET_MULTIPLIER,
    radius,
  });
  if (plan.size === 0) {
    return { docs: [...hits], addedChunks: 0, failedFiles: 0 };
  }

  let failedFiles = 0;
  const fetched = new Map<string, Map<number, T>>();
  await Promise.all(
    [...plan.entries()].map(async ([fileId, indexes]) => {
      try {
        const chunks = await fetchChunks(fileId, indexes);
        const wanted = new Set(indexes);
        const byIndex = new Map<number, T>();
        for (const chunk of chunks) {
          const position = expandablePosition(chunk);
          // Only what was asked for, in the file asked about, and prose:
          // the lookup's filter says so already, and this does not rely on it.
          if (
            position &&
            position.fileId === fileId &&
            wanted.has(position.chunkIndex)
          ) {
            byIndex.set(position.chunkIndex, chunk);
          }
        }
        fetched.set(fileId, byIndex);
      } catch {
        failedFiles++;
      }
    }),
  );

  let addedChunks = 0;
  const claimed = new Set<string>();
  const sections = hits.map((hit) => {
    const position = expandablePosition(hit);
    const neighbours = position ? fetched.get(position.fileId) : undefined;
    if (!position || !neighbours) {
      return { hit, chunks: [hit] };
    }
    const chunks = [hit];
    for (let offset = -radius; offset <= radius; offset++) {
      const index = position.chunkIndex + offset;
      const key = `${position.fileId}:${index}`;
      const neighbour = neighbours.get(index);
      if (offset !== 0 && neighbour && !claimed.has(key)) {
        claimed.add(key);
        chunks.push(neighbour);
        addedChunks++;
      }
    }
    return { hit, chunks };
  });

  return { docs: mergeExpanded(sections), addedChunks, failedFiles };
}
