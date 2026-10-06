import { describe, expect, it } from 'vitest';
import { summarizeGraphTopics, parseGraphMode } from '../graph-topics';
import type { KnowledgeGraph } from '@ragenai/brain-contracts';
const graph: KnowledgeGraph = {
  formatVersion: 1,
  nodes: [
    {
      id: 'a',
      title: 'A',
      type: 'ENTITY',
      status: 'APPROVED',
      community: 0,
      degree: 1,
    },
    {
      id: 'b',
      title: 'B',
      type: 'POLICY',
      status: 'CANDIDATE',
      community: 0,
      degree: 1,
    },
    {
      id: 'c',
      title: 'C',
      type: 'ENTITY',
      status: 'CANDIDATE',
      community: 1,
      degree: 0,
    },
  ],
  edges: [
    {
      from: 'a',
      to: 'b',
      kind: 'dotyczy',
      origin: 'EXTRACTED',
      confidence: null,
    },
  ],
  communities: [
    { id: 0, label: 'A', size: 2 },
    { id: 1, label: 'C', size: 1 },
  ],
};
describe('graph topics', () => {
  it('partitions live pages once and counts review states from membership', () => {
    const summary = summarizeGraphTopics(graph);
    expect(summary.topics).toHaveLength(1);
    expect(summary.topics[0]).toMatchObject({
      label: 'A',
      anchor: 'a',
      approved: 1,
      candidates: 1,
    });
    expect(summary.topics[0]?.pages.map((p) => p.id)).toEqual(['a', 'b']);
    expect(summary.isolated.map((p) => p.id)).toEqual(['c']);
  });
  it('counts every page beyond the canvas budget and handles an empty graph', () => {
    const nodes = Array.from({ length: 151 }, (_, i) => ({
      ...graph.nodes[1]!,
      id: String(i),
      degree: 1,
    }));
    expect(
      summarizeGraphTopics({ ...graph, nodes }).topics[0]?.pages,
    ).toHaveLength(151);
    expect(
      summarizeGraphTopics({ ...graph, nodes: [], edges: [], communities: [] }),
    ).toEqual({ topics: [], isolated: [] });
  });
  it('keeps connected singleton communities as topics instead of calling them isolated', () => {
    expect(
      summarizeGraphTopics({
        ...graph,
        nodes: [{ ...graph.nodes[2]!, degree: 1 }],
      }).topics,
    ).toHaveLength(1);
  });
  it('defaults to topics, preserves existing focus deep links and accepts only known modes', () => {
    expect(parseGraphMode(undefined, null)).toBe('topics');
    expect(parseGraphMode('invalid', null)).toBe('topics');
    expect(parseGraphMode(undefined, 'a')).toBe('neighbourhood');
    expect(parseGraphMode(['full', 'topics'], 'a')).toBe('full');
    expect(parseGraphMode('topics', 'a')).toBe('topics');
  });
});
