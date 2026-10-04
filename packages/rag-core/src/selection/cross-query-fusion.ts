/**
 * Cross-query fusion (spec 2026-10-03-retrieval-claims, B0): one ranked list
 * from the per-query hit lists, by reciprocal rank, for a turn where nothing
 * else chooses among them.
 *
 * Without it, a turn with no reranker and no selection keeps
 * `uniqueDocs.slice(0, maxDocuments)` of the lists concatenated in query
 * order — the first query's hits — so a multi-query variant's hits never
 * reach the model unless the first query came up short. Qdrant already fuses
 * dense and sparse by RRF inside each query; this applies the same rule one
 * level up, across queries.
 *
 * Plain function, shared by both chains (apps/web and apps/api).
 */

/** The usual RRF constant: damps the gap between rank 1 and rank 2. */
export const CROSS_QUERY_RRF_K = 60;

/**
 * Each distinct chunk (by `pageContent`, as the chains dedupe) scores
 * `Σ 1 / (k + rank)` over the lists it appears in, rank counted from 1 and
 * taken once per list — its first occurrence there.
 * Ties keep the order of first appearance, so with one list — or identical
 * lists — the result is that list, deduped.
 */
export function fuseAcrossQueries<T extends { pageContent: string }>(
  resultsPerQuery: readonly (readonly T[])[],
  k: number = CROSS_QUERY_RRF_K,
): T[] {
  const entries = new Map<
    string,
    { doc: T; score: number; firstSeen: number }
  >();
  let seen = 0;
  for (const results of resultsPerQuery) {
    // A chunk counts once per list, at its best rank: a query that returned
    // it twice is still one vote, as the chains' dedupe treats it.
    const seenInList = new Set<string>();
    results.forEach((doc, index) => {
      if (seenInList.has(doc.pageContent)) {
        return;
      }
      seenInList.add(doc.pageContent);
      const contribution = 1 / (k + index + 1);
      const entry = entries.get(doc.pageContent);
      if (entry) {
        entry.score += contribution;
      } else {
        entries.set(doc.pageContent, {
          doc,
          score: contribution,
          firstSeen: seen,
        });
      }
      seen += 1;
    });
  }
  return [...entries.values()]
    .sort((a, b) => b.score - a.score || a.firstSeen - b.firstSeen)
    .map((entry) => entry.doc);
}
