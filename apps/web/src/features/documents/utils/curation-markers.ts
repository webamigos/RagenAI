/**
 * The keys a person set on a file's metadata that say where the file goes,
 * and that anything rewriting the metadata must carry over:
 *
 * - `intake` — staged into Ragen Brain rather than the knowledge base (F1);
 * - `retrieval` — taken out of retrieval by a person (E9).
 *
 * The worker reads both on every ingest. A writer that replaced the metadata
 * wholesale — the Drive sync did — dropped them, and the re-ingest that
 * followed indexed a file someone had deliberately kept out.
 */
export function curationMarkers(metadata: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return out;
  }
  const source = metadata as Record<string, unknown>;
  for (const key of ['intake', 'retrieval'] as const) {
    if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}
