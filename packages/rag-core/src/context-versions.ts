/**
 * Which context prefix an organization's chunks were embedded with, counted
 * per file (spec 2026-09-29-contextual-chunks). Shared by the operator's
 * `reindex-for-context.ts` in apps/worker and the knowledge-base settings in
 * apps/web, so the two cannot disagree on what "stale" means.
 */

/** Version 1: the prefix built without any model call. */
export const FREE_CONTEXT_PREFIX_VERSION = 1;

/**
 * The version a file indexed today gets. A file below it is stale and is
 * what a re-index brings up. 2 would be a model-written prefix, which Phase B
 * would ship; A3 left no gap for it, so it has not.
 */
export const CURRENT_CONTEXT_VERSION = FREE_CONTEXT_PREFIX_VERSION;

/** A point as a scroll returns it: only the payload is read. */
export interface ContextPoint {
  payload?: Record<string, unknown> | null;
}

/**
 * Each file's context version: the lowest over its body chunks, where a
 * chunk without `context_version` is 0. The summary chunk is never prefixed
 * (it is the document-level context already), so it does not count. One
 * stale chunk makes the file stale, because retrieval reads chunks, not
 * files.
 */
export function fileContextVersions(
  points: readonly ContextPoint[],
): Map<string, number> {
  const versions = new Map<string, number>();
  for (const point of points) {
    const metadata = point.payload?.metadata as
      Record<string, unknown> | undefined;
    const fileId = metadata?.file_id;
    if (
      !metadata ||
      typeof fileId !== 'string' ||
      metadata.chunk_type === 'summary'
    ) {
      continue;
    }
    const raw = metadata.context_version;
    const version =
      typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : 0;
    versions.set(fileId, Math.min(versions.get(fileId) ?? version, version));
  }
  return versions;
}

/** Files per context version, lowest first: `[[0, 12], [1, 30]]`. */
export function countByVersion(
  versions: ReadonlyMap<string, number>,
): [number, number][] {
  const counts = new Map<number, number>();
  for (const version of versions.values()) {
    counts.set(version, (counts.get(version) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a - b);
}

/** The payload fields a scroll needs to return for `fileContextVersions`. */
export const CONTEXT_VERSION_PAYLOAD_FIELDS = [
  'metadata.file_id',
  'metadata.chunk_type',
  'metadata.context_version',
] as const;
