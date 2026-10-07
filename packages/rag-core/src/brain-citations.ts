import type { DocumentActor } from './document-access';

/**
 * The second level of a Brain citation (spec E8): for each cited file that is
 * a published page, the page's title and the source documents behind it.
 *
 * The queries stay with each app, because each has its own Prisma client. The
 * two decisions that matter are here, so the panel and the API cannot read a
 * page by different rules: who may read the page, and what a reader who may
 * read it but not all of its sources is shown.
 */
export type BrainCitation = {
  pageTitle: string;
  sources: { fileName: string; documentId: string | null; span: string }[];
};

/** Keyed by the cited file's id — the page's publication vehicle. */
export type BrainCitations = Record<string, BrainCitation>;

/** A page as the query returns it. */
export type CitedPage = {
  title: string;
  accessibleBy: string[];
  publishedFileId: string | null;
  sources: { fileId: string; span: string }[];
};

/** A source document the reader may open, as the query returns it. */
export type ReadableSourceFile = {
  id: string;
  fileName: string;
  documentId: string | null;
};

/**
 * Whether the reader matches a principal on the page, as retrieval matches it.
 *
 * The page is checked by its own `accessibleBy`, the rule its chunks were
 * retrieved under. The vehicle file's sharing is not the question: a reader
 * who retrieved the page through a team principal may not pass
 * `fileAccessWhere` on that file, and still reads the page legitimately.
 */
export function canReadPage(
  orgId: string,
  actor: DocumentActor,
  accessibleBy: string[],
): boolean {
  if (actor.scope === 'organization') {
    return true;
  }
  const mine = new Set([
    `org:${orgId}`,
    ...(actor.userId ? [`user:${actor.userId}`] : []),
    ...actor.teamIds.map((t) => `team:${t}`),
  ]);
  return accessibleBy.some((p) => mine.has(p));
}

/**
 * Builds the citations from what the two queries found.
 *
 * `files` must already be filtered by `fileAccessWhere`: a page widened to
 * someone who may not see all of its sources shows them the page and only the
 * sources they may open — never the names of the others (spec E8: "gets the
 * page and no source list"). A source that is not in `files` is dropped here,
 * which is the half of that rule this function owns.
 */
export function shapeBrainCitations(
  orgId: string,
  actor: DocumentActor,
  pages: readonly CitedPage[],
  files: readonly ReadableSourceFile[],
): BrainCitations {
  const byId = new Map(files.map((f) => [f.id, f]));
  const result: BrainCitations = {};
  for (const page of pages) {
    if (
      !page.publishedFileId ||
      !canReadPage(orgId, actor, page.accessibleBy)
    ) {
      continue;
    }
    const seen = new Set<string>();
    const sources: BrainCitation['sources'] = [];
    for (const s of page.sources) {
      const file = byId.get(s.fileId);
      const key = `${s.fileId}\u0000${s.span}`;
      if (!file || seen.has(key)) {
        continue;
      }
      seen.add(key);
      sources.push({
        fileName: file.fileName,
        documentId: file.documentId,
        span: s.span,
      });
    }
    result[page.publishedFileId] = { pageTitle: page.title, sources };
  }
  return result;
}
