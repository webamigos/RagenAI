/**
 * What the report says about reranking and multi-query, and where each part
 * of it comes from.
 *
 * The report used to stamp both from *this* process's environment. The app
 * is a separate process with its own: `FEATURE_FLAG_RERANKING` here says
 * nothing certain about the server, and `MULTI_QUERY_VARIANT_COUNT` is not an
 * environment variable at all — it is a constant in
 * `src/libs/chains/basic-rag/operations.ts` — so every report printed
 * "1 (default)" whatever the organization had set. The per-organization
 * switches are in the database the run already reads, so they come from
 * there; the one part only the server knows is labelled as the runner's
 * guess. The `retrieval` frame planned in
 * docs/specs/2026-09-29-llm-document-selection.md (Phase A) replaces the
 * guess with what the server did.
 */

export interface OrgRetrievalSettings {
  rerankingEnabled: boolean | null;
  multiQueryEnabled: boolean | null;
}

/** Mirrors `MULTI_QUERY_VARIANT_COUNT`, not imported: that module is server-only. */
const MULTI_QUERY_VARIANTS_IN_CODE = 1;

export function describeRetrievalSettings(
  org: OrgRetrievalSettings | null,
  runnerEnv: Readonly<Record<string, string | undefined>>,
): { rerankingEnabled: string; multiQueryVariants: string } {
  // The chain's own defaults: a null setting means on
  // (`defaultRagPipelineSettings`).
  const orgReranking = org?.rerankingEnabled ?? true;
  const orgMultiQuery = org?.multiQueryEnabled ?? true;

  const runnerFlag =
    runnerEnv.FEATURE_FLAG_RERANKING === '1'
      ? 'FEATURE_FLAG_RERANKING=1'
      : 'FEATURE_FLAG_RERANKING unset';

  const rerankingEnabled = orgReranking
    ? `on for the organization; ${runnerFlag} in the runner's environment (the server's is not visible)`
    : 'off (organization setting)';

  const multiQueryVariants = orgMultiQuery
    ? `on, ${MULTI_QUERY_VARIANTS_IN_CODE} variant per turn (code constant)`
    : 'off (organization setting)';

  return { rerankingEnabled, multiQueryVariants };
}
