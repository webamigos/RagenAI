import {
  assembleGraph,
  GRAPH_BUDGETS,
  selectGraphView,
  type GraphBudget,
} from '@ragenai/brain-core';
import db from '@ragenai/prisma-client';
import type { BrainLanguageScope } from './brain-language-scope';

import type { BrainGraphView } from '../../contracts/brain-graph.types';

export type BrainGraphParams = {
  focus: string | null;
  hops: 1 | 2;
  budget: GraphBudget;
  includeInferred: boolean;
};

/**
 * The organization's pages as a graph, cut to what the panel draws (spec D4).
 *
 * Every page but the rejected ones, and every edge between them, assembled
 * by `assembleGraph` — the same function the bundle export will use, so the
 * communities on screen are the ones in `graph.json`. Pages with an open
 * finding are pinned into the overview. The cut itself is `selectGraphView`;
 * this reads the rows and adds what a node card shows.
 */
export async function getBrainGraphQuery(
  orgId: string,
  params: BrainGraphParams,
  scope: BrainLanguageScope | null = null,
): Promise<BrainGraphView> {
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

  const view = selectGraphView(graph, {
    ...params,
    pinned: new Set(openFindings.keys()),
  });
  return {
    ...view,
    nodes: view.nodes.map((n) => ({
      ...n,
      openFindings: openFindings.get(n.id) ?? 0,
    })),
    budget: params.budget,
    budgets: [...GRAPH_BUDGETS],
    hops: params.hops,
    includeInferred: params.includeInferred,
  };
}

/** The view's parameters from a URL, clamped to what the server allows. */
export function parseGraphParams(search: {
  focus?: string | string[];
  hops?: string | string[];
  budget?: string | string[];
  inferred?: string | string[];
}): BrainGraphParams {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const focus = one(search.focus);
  const budget = Number(one(search.budget));
  return {
    focus:
      focus &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        focus,
      )
        ? focus
        : null,
    hops: one(search.hops) === '2' ? 2 : 1,
    budget: (GRAPH_BUDGETS as readonly number[]).includes(budget)
      ? (budget as GraphBudget)
      : GRAPH_BUDGETS[0],
    includeInferred: one(search.inferred) === '1',
  };
}
