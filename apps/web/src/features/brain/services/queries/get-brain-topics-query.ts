import { getBrainGraphDataQuery } from './get-brain-graph-data-query';
import type { BrainLanguageScope } from './brain-language-scope';
import { summarizeGraphTopics } from '../../utils/graph-topics';
/** Full topic counts and searchable titles, always under the session organization. */
export async function getBrainTopicsQuery(
  orgId: string,
  scope: BrainLanguageScope | null = null,
) {
  const { graph } = await getBrainGraphDataQuery(orgId, scope);
  return { ...summarizeGraphTopics(graph), pages: graph.nodes };
}
