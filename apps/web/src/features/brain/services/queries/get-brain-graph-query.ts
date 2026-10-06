import {
  GRAPH_BUDGETS,
  selectGraphView,
  type GraphBudget,
} from '@ragenai/brain-core';
import { getBrainGraphDataQuery } from './get-brain-graph-data-query';
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
  const { graph, openFindings } = await getBrainGraphDataQuery(orgId, scope);
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
