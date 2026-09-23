import { describe, expect, it } from 'vitest';

import { GRAPH_FORMAT_VERSION, knowledgeGraphSchema } from '../graph';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const node = (id: string, community = 0) => ({
  id,
  title: `page ${id.slice(-1)}`,
  type: 'PROCESS' as const,
  status: 'APPROVED' as const,
  community,
  degree: 1,
});
const graph = (over: Record<string, unknown> = {}) => ({
  formatVersion: GRAPH_FORMAT_VERSION,
  nodes: [node(A), node(B)],
  edges: [
    { from: A, to: B, kind: 'approves', origin: 'EXTRACTED', confidence: null },
    { from: A, to: B, kind: 'approves', origin: 'INFERRED', confidence: 0.4 },
  ],
  communities: [{ id: 0, size: 2, label: 'page a' }],
  ...over,
});

describe('knowledgeGraphSchema', () => {
  // The same pair, stated and guessed, stays two edges.
  it('accepts a graph that keeps two origins of one relation apart', () => {
    expect(knowledgeGraphSchema.safeParse(graph()).success).toBe(true);
  });

  it('refuses an edge naming a page the graph does not contain', () => {
    const result = knowledgeGraphSchema.safeParse(graph({ nodes: [node(A)] }));
    expect(result.success).toBe(false);
  });

  it('refuses a page listed twice', () => {
    const result = knowledgeGraphSchema.safeParse(
      graph({ nodes: [node(A), node(A), node(B)] }),
    );
    expect(result.success).toBe(false);
  });

  it('refuses a node in a community that does not exist', () => {
    const result = knowledgeGraphSchema.safeParse(
      graph({ nodes: [node(A), node(B, 3)] }),
    );
    expect(result.success).toBe(false);
  });

  it('refuses an origin outside the vocabulary', () => {
    const result = knowledgeGraphSchema.safeParse(
      graph({
        edges: [
          { from: A, to: B, kind: 'x', origin: 'GUESSED', confidence: null },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('refuses another format version', () => {
    expect(
      knowledgeGraphSchema.safeParse(graph({ formatVersion: 2 })).success,
    ).toBe(false);
  });
});
