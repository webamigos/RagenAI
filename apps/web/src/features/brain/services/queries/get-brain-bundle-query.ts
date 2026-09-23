import { buildBundle, type Bundle } from '@ragenai/brain-core';
import db from '@ragenai/prisma-client';

/**
 * The organization's bundle (spec E1), built from the rows as they are now.
 *
 * Not persisted: a bundle is a projection of Postgres and the ledger, which
 * stay the source of truth, so each download is generated fresh rather than
 * written to storage and left to go stale beside the data it copied. Every
 * page is read except rejected ones; `buildBundle` decides which leave and
 * says why the others did not.
 */
export async function getBrainBundleQuery(orgId: string): Promise<Bundle> {
  const [pages, edges] = await Promise.all([
    db.knowledgePage.findMany({
      where: { organizationId: orgId, status: { not: 'REJECTED' } },
      select: {
        id: true,
        publicId: true,
        slug: true,
        title: true,
        type: true,
        status: true,
        content: true,
        contentHash: true,
        accessibleBy: true,
        validFrom: true,
        verifyEvery: true,
        lastVerifiedAt: true,
        lastVerifiedBy: true,
        owner: { select: { email: true } },
        supersededBy: { select: { publicId: true } },
        sources: {
          where: { organizationId: orgId },
          orderBy: { id: 'asc' },
          select: {
            fileId: true,
            documentVersionId: true,
            span: true,
            quote: true,
            hash: true,
            sourceDeletedAt: true,
          },
        },
      },
    }),
    db.knowledgeEdge.findMany({
      where: { organizationId: orgId },
      select: {
        fromPageId: true,
        toPageId: true,
        kind: true,
        origin: true,
        confidence: true,
      },
    }),
  ]);

  const publicOf = new Map(pages.map((p) => [p.id, p.publicId]));
  return buildBundle({
    organizationId: orgId,
    generatedAt: new Date(),
    pages: pages.map((p) => ({
      id: p.publicId,
      slug: p.slug,
      title: p.title,
      type: p.type,
      status: p.status,
      content: p.content,
      contentHash: p.contentHash,
      owner: p.owner?.email ?? null,
      accessibleBy: p.accessibleBy,
      validFrom: p.validFrom ? p.validFrom.toISOString().slice(0, 10) : null,
      supersededBy: p.supersededBy?.publicId ?? null,
      verifyEvery: p.verifyEvery,
      lastVerifiedAt: p.lastVerifiedAt?.toISOString() ?? null,
      lastVerifiedBy: p.lastVerifiedAt ? p.lastVerifiedBy : null,
      sources: p.sources.map((s) => ({
        ...s,
        sourceDeletedAt: s.sourceDeletedAt?.toISOString() ?? null,
      })),
    })),
    edges: edges.flatMap((e) => {
      const from = publicOf.get(e.fromPageId);
      const to = publicOf.get(e.toPageId);
      return from && to
        ? [
            {
              from,
              to,
              kind: e.kind,
              origin: e.origin,
              confidence: e.confidence,
            },
          ]
        : [];
    }),
  });
}
