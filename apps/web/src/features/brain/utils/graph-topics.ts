import type { GraphNode, KnowledgeGraph } from '@ragenai/brain-contracts';
export type GraphMode = 'topics' | 'neighbourhood' | 'full';
export type GraphTopic = {
  label: string;
  anchor: string;
  pages: GraphNode[];
  approved: number;
  candidates: number;
};
export type GraphTopics = { topics: GraphTopic[]; isolated: GraphNode[] };
/** The complete community partition, independent of any canvas node budget. */
export function summarizeGraphTopics(graph: KnowledgeGraph): GraphTopics {
  const members = new Map<number, GraphNode[]>();
  const isolated: GraphNode[] = [];
  for (const node of graph.nodes) {
    if (node.degree === 0) {
      isolated.push(node);
      continue;
    }
    const pages = members.get(node.community) ?? [];
    pages.push(node);
    members.set(node.community, pages);
  }
  return {
    topics: graph.communities.flatMap((community) => {
      const pages = members.get(community.id);
      if (!pages?.length) {
        return [];
      }
      const hub = [...pages].sort(
        (a, b) =>
          b.degree - a.degree ||
          a.title.localeCompare(b.title) ||
          a.id.localeCompare(b.id),
      )[0]!;
      return [
        {
          label: community.label,
          anchor: hub.id,
          pages,
          approved: pages.filter((p) => p.status === 'APPROVED').length,
          candidates: pages.filter((p) => p.status === 'CANDIDATE').length,
        },
      ];
    }),
    isolated,
  };
}
export function parseGraphMode(
  value: string | string[] | undefined,
  focus: string | null,
): GraphMode {
  const mode = Array.isArray(value) ? value[0] : value;
  if (mode === 'topics' || mode === 'neighbourhood' || mode === 'full') {
    return mode;
  }
  return focus ? 'neighbourhood' : 'topics';
}
