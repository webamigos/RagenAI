import { z } from 'zod';

import { uuidSchema } from './primitives';

import {
  KNOWLEDGE_EDGE_ORIGINS,
  KNOWLEDGE_PAGE_STATUSES,
  KNOWLEDGE_PAGE_TYPES,
} from './vocabulary';

/** The format version of `graph.json`, independent of the manifest's. */
export const GRAPH_FORMAT_VERSION = 1;

export const graphNodeSchema = z.object({
  /** The page's `publicId` — the same id as its frontmatter and manifest entry. */
  id: uuidSchema,
  title: z.string().trim().min(1),
  type: z.enum(KNOWLEDGE_PAGE_TYPES),
  status: z.enum(KNOWLEDGE_PAGE_STATUSES),
  /** Index into `communities`. */
  community: z.int().nonnegative(),
  /** Edges touching the node, counted once per distinct neighbour. */
  degree: z.int().nonnegative(),
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

/**
 * One edge, as extracted. **The origin is never merged away**: the same pair
 * related once by a quoted sentence and once by the model's guess is two
 * edges here, because a reader deciding whether to trust a link needs to
 * know which of the two it is looking at.
 */
export const graphEdgeSchema = z.object({
  from: uuidSchema,
  to: uuidSchema,
  kind: z.string().trim().min(1),
  origin: z.enum(KNOWLEDGE_EDGE_ORIGINS),
  confidence: z.number().min(0).max(1).nullable(),
});
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const graphCommunitySchema = z.object({
  id: z.int().nonnegative(),
  size: z.int().positive(),
  /** The title of the community's most connected page — a handle, not a name. */
  label: z.string().trim().min(1),
});
export type GraphCommunity = z.infer<typeof graphCommunitySchema>;

/**
 * `graph.json` — the pages as a graph, for browsing (D4) and in the bundle
 * (E1). Every edge names two nodes that are in the file: a graph exported
 * without some pages must drop their edges too, or it names pages the reader
 * was not given.
 */
export const knowledgeGraphSchema = z
  .object({
    formatVersion: z.literal(GRAPH_FORMAT_VERSION),
    nodes: z.array(graphNodeSchema),
    edges: z.array(graphEdgeSchema),
    communities: z.array(graphCommunitySchema),
  })
  .refine((g) => new Set(g.nodes.map((n) => n.id)).size === g.nodes.length, {
    message: 'each page appears in the graph once',
    path: ['nodes'],
  })
  .refine(
    (g) => {
      const ids = new Set(g.nodes.map((n) => n.id));
      return g.edges.every((e) => ids.has(e.from) && ids.has(e.to));
    },
    {
      message: 'an edge names a page that is not in the graph',
      path: ['edges'],
    },
  )
  .refine((g) => g.nodes.every((n) => n.community < g.communities.length), {
    message: 'a node names a community that does not exist',
    path: ['nodes'],
  });
export type KnowledgeGraph = z.infer<typeof knowledgeGraphSchema>;
