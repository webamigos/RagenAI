/**
 * Which vector-store backends an install can actually use.
 *
 * Three clients exist in the tree — Qdrant, Meilisearch and Supabase — and all
 * three are still selectable in an organization's `vectorStore` column. Only
 * one of them works end to end.
 *
 * Ingest moved into `apps/worker` with ADR-26, and its
 * `addDocumentsToVectorStore` activity writes to Qdrant unconditionally: the
 * organization's setting is never read on the write path. Retrieval *does*
 * honour it. So an organization set to `meilisearch` or `supabase` reads from a
 * store nothing has ever written to, and gets zero results with no error — the
 * worst possible failure, because it is indistinguishable from a knowledge base
 * that genuinely has no answer.
 *
 * Rather than delete clients someone may yet want to adapt, this module makes
 * the limitation explicit at the point of selection. Widening SUPPORTED means
 * teaching the worker to route by the same setting; see ADR-31.
 */
export const KNOWN_VECTOR_STORES = [
  'qdrant',
  'meilisearch',
  'supabase',
] as const;

export type KnownVectorStore = (typeof KNOWN_VECTOR_STORES)[number];

/** Backends the ingest worker can actually write to. */
export const SUPPORTED_VECTOR_STORES = ['qdrant'] as const;

export type SupportedVectorStore = (typeof SUPPORTED_VECTOR_STORES)[number];

export const DEFAULT_VECTOR_STORE: SupportedVectorStore = 'qdrant';

export function isSupportedVectorStore(
  value: string | undefined | null,
): value is SupportedVectorStore {
  return (SUPPORTED_VECTOR_STORES as readonly string[]).includes(value ?? '');
}

export function isKnownVectorStore(
  value: string | undefined | null,
): value is KnownVectorStore {
  return (KNOWN_VECTOR_STORES as readonly string[]).includes(value ?? '');
}

/**
 * Resolve the backend new organizations should be created with.
 *
 * Throws rather than falling back when `DEFAULT_VECTOR_STORE` names an
 * unsupported backend. Silently substituting Qdrant would leave the operator
 * believing their configuration took effect; failing at organization creation
 * says which variable is wrong, once, where they can act on it.
 */
export function resolveDefaultVectorStore(
  // Injected so it can be exercised without mutating process.env. Indexed
  // rather than a named optional field: ProcessEnv has an index signature and
  // no declared properties, so the narrower shape does not overlap with it.
  env: Record<string, string | undefined> = process.env,
): SupportedVectorStore {
  const configured = env.DEFAULT_VECTOR_STORE?.trim();

  if (!configured) {
    return DEFAULT_VECTOR_STORE;
  }

  if (isSupportedVectorStore(configured)) {
    return configured;
  }

  if (isKnownVectorStore(configured)) {
    throw new Error(
      `DEFAULT_VECTOR_STORE="${configured}" is not usable: the ingest worker ` +
        `writes to Qdrant only, so retrieval from ${configured} would always ` +
        `return nothing. Supported: ${SUPPORTED_VECTOR_STORES.join(', ')}.`,
    );
  }

  throw new Error(
    `Unknown DEFAULT_VECTOR_STORE="${configured}". Supported: ` +
      `${SUPPORTED_VECTOR_STORES.join(', ')}.`,
  );
}
