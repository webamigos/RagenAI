/**
 * The `where` fragment that keeps a published Brain page's file out of every
 * document delete and listing (spec E10).
 *
 * That file is the page's publication vehicle: it is created on the first
 * publication and never deleted, because `DocumentCitation` and
 * `DocumentRetrieval` cascade from it — deleting it would erase every past
 * answer that cited the page. The foreign key from `knowledge_pages` would
 * refuse the delete anyway, but only at the end, after storage, vectors and
 * audit entries were already gone. Filtering it out of the lookup means no
 * delete path ever starts on it; the page is withdrawn from Brain instead.
 */
export const NOT_A_BRAIN_VEHICLE = { publishedPages: { none: {} } } as const;
