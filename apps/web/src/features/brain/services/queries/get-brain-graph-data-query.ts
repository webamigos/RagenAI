import { assembleGraph } from '@ragenai/brain-core';
import db from '@ragenai/prisma-client';
import type { BrainLanguageScope } from './brain-language-scope';
/** Complete scoped graph; canvas selection and topic counts share this partition. */
export async function getBrainGraphDataQuery(
  orgId: string,
  scope: BrainLanguageScope | null = null,
) {
  const [pages, edges, findings] = await Promise.all([
    db.knowledgePage.findMany({
      where: {
        organizationId: orgId,
        status: { not: 'REJECTED' },
        // A language narrows the graph to its pages; an edge to a page
        // outside it has no end to draw and is left out with it.
        ...(scope ? { id: { in: scope.pageIds } } : {}),
      },
      select: {
        id: true,
        publicId: true,
        title: true,
        type: true,
        status: true,
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
    db.knowledgeFinding.findMany({
      where: { organizationId: orgId, status: 'OPEN' },
      select: { pageIds: true },
    }),
  ]);

  const publicOf = new Map(pages.map((p) => [p.id, p.publicId]));
  const { graph } = assembleGraph(
    pages.map((p) => ({
      id: p.publicId,
      title: p.title,
      type: p.type,
      status: p.status,
    })),
    edges.flatMap((e) => {
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
  );

  const openFindings = new Map<string, number>();
  for (const f of findings) {
    for (const pageId of f.pageIds) {
      const publicId = publicOf.get(pageId);
      if (publicId) {
        openFindings.set(publicId, (openFindings.get(publicId) ?? 0) + 1);
      }
    }
  }

  return { graph, openFindings };
}
