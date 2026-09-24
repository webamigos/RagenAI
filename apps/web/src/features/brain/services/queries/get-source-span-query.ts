import db from '@ragenai/prisma-client';

/** Characters shown on each side of a quote. A window, never the document. */
export const SOURCE_SPAN_WINDOW = 600;

export type SourceSpan = {
  fileName: string | null;
  span: string;
  quote: string;
  /** The version the citation is pinned to, and the document's active one. */
  pinnedVersion: number | null;
  activeVersion: number | null;
  /** The text around the quote in the pinned version; null when not found. */
  pinnedWindow: string | null;
  /**
   * Whether the quoted words still occur in the active version — the question
   * a STALE finding asks. Null when the document has no other version.
   */
  quoteInActive: boolean | null;
};

/**
 * The passage a page's citation rests on (spec "Reading — tools",
 * `getSourceSpan`): the words around the quote, from the version the curator
 * read, and whether the document's current version still says them.
 *
 * Scoped twice — the source through its page, both in the organization — so
 * a source id from another organization, or from a page this one does not
 * hold, answers null rather than text.
 */
export async function getSourceSpanQuery(
  orgId: string,
  pagePublicId: string,
  sourceId: number,
): Promise<SourceSpan | null> {
  const source = await db.knowledgePageSource.findFirst({
    where: {
      organizationId: orgId,
      id: sourceId,
      page: { organizationId: orgId, publicId: pagePublicId },
    },
    select: {
      fileId: true,
      documentVersionId: true,
      span: true,
      quote: true,
      sourceDeletedAt: true,
    },
  });
  if (!source) {
    return null;
  }
  const [file, pinned] = await Promise.all([
    db.userFile.findFirst({
      where: { organizationId: orgId, id: source.fileId },
      select: {
        fileName: true,
        documentId: true,
        document: { select: { id: true } },
      },
    }),
    db.documentVersion.findFirst({
      where: { organizationId: orgId, id: source.documentVersionId },
      select: { documentId: true, versionNumber: true, content: true },
    }),
  ]);
  const documentId =
    file?.document?.id ?? file?.documentId ?? pinned?.documentId ?? null;
  const active =
    documentId && source.sourceDeletedAt === null
      ? await db.documentVersion.findFirst({
          where: { organizationId: orgId, documentId, isActive: true },
          select: { id: true, versionNumber: true, content: true },
        })
      : null;

  const differs = active && active.id !== source.documentVersionId;
  return {
    fileName: file?.fileName ?? null,
    span: source.span,
    quote: source.quote,
    pinnedVersion: pinned?.versionNumber ?? null,
    activeVersion: active?.versionNumber ?? null,
    pinnedWindow: pinned ? windowAround(pinned.content, source.quote) : null,
    quoteInActive: differs
      ? normalise(active.content).includes(normalise(source.quote))
      : null,
  };
}

/** The quote with up to `SOURCE_SPAN_WINDOW` characters either side, or null. */
export function windowAround(text: string, quote: string): string | null {
  const flat = text.replace(/\s+/g, ' ');
  const at = flat.toLowerCase().indexOf(normalise(quote));
  if (at === -1) {
    return null;
  }
  const from = Math.max(0, at - SOURCE_SPAN_WINDOW);
  const to = Math.min(flat.length, at + quote.length + SOURCE_SPAN_WINDOW);
  return `${from > 0 ? '…' : ''}${flat.slice(from, to)}${to < flat.length ? '…' : ''}`;
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}
