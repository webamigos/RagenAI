import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';

import { dbUuid } from '@/features/brain/contracts/brain-review.types';
import type {
  KnowledgeFindingListItem,
  KnowledgePageDetail,
} from '@/features/brain/contracts/brain.types';
import { getBrainDocumentsQuery } from '@/features/brain/services/queries/get-brain-documents-query';
import { getBrainGraphQuery } from '@/features/brain/services/queries/get-brain-graph-query';
import { getBrainReviewOptionsQuery } from '@/features/brain/services/queries/get-brain-review-options-query';
import { getKnowledgeDecisionsQuery } from '@/features/brain/services/queries/get-knowledge-decisions-query';
import {
  getKnowledgeFindingQuery,
  getKnowledgeFindingsQuery,
} from '@/features/brain/services/queries/get-knowledge-findings-query';
import { getKnowledgePageQuery } from '@/features/brain/services/queries/get-knowledge-page-query';
import { getSourceSpanQuery } from '@/features/brain/services/queries/get-source-span-query';
import { searchKnowledgePagesQuery } from '@/features/brain/services/queries/search-knowledge-pages-query';

import {
  brainProposalInputSchema,
  type BrainProposal,
} from '../../contracts/brain-assistant.types';
import { buildBrainProposalQuery } from './build-brain-proposal-query';

/** Rows any list tool returns at most (spec: "lists page at 30"). */
export const TOOL_LIST_LIMIT = 30;
/** A page's text as a tool returns it; the quotes carry the evidence. */
const PAGE_TEXT_LIMIT = 4000;

const FINDING_TYPES = [
  'CONTRADICTION',
  'GAP',
  'STALE',
  'ORPHAN',
  'UNOWNED',
  'EXTRACTION_FAILED',
] as const;

export type BrainAssistantToolContext = {
  orgId: string;
  /**
   * Whether this person may change Brain. Without it the proposal tool is not
   * offered at all — a read-only visitor is never shown a proposal, not only
   * refused one on Apply.
   */
  canWrite: boolean;
  /** Called with each proposal the server accepted, in the order made. */
  onProposal: (proposal: BrainProposal) => void;
  /** Called when the model sent a proposal outside the schema. */
  onProposalDropped: () => void;
};

/**
 * The assistant's tools (spec "Reading — tools").
 *
 * Every read tool wraps a Brain query and takes the organization from the
 * session-derived context, never from its input: access is decided where the
 * Brain screens decide it, and an id from elsewhere answers "not found" — the
 * same as the page would, so nothing about its existence leaks.
 *
 * Output is compact and carries the ids an answer links to.
 */
export function createBrainAssistantTools(context: BrainAssistantToolContext) {
  const { orgId } = context;

  const read = {
    listFindings: tool({
      description:
        'List findings in the inbox, most severe and newest first. Use for "what should I look at first" and to find a finding by type.',
      inputSchema: z.object({
        status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']).default('OPEN'),
        type: z.enum(FINDING_TYPES).optional(),
      }),
      execute: async ({ status, type }) => {
        const { items, total } = await getKnowledgeFindingsQuery(orgId, status);
        const matching = type ? items.filter((f) => f.type === type) : items;
        return {
          total: type ? matching.length : total,
          findings: matching.slice(0, TOOL_LIST_LIMIT).map(compactFinding),
        };
      },
    }),

    getFinding: tool({
      description: 'Read one finding by its id, with the pages it names.',
      inputSchema: z.object({ findingId: dbUuid }),
      execute: async ({ findingId }) => {
        const finding = await getKnowledgeFindingQuery(orgId, findingId);
        return finding ? compactFinding(finding) : NOT_FOUND;
      },
    }),

    getPage: tool({
      description:
        'Read one knowledge page: its text, every source with its verbatim quote and whether the document moved on, its owner, access, publication, relations, open findings and recent decisions. Cite quotes from here.',
      inputSchema: z.object({ pageId: dbUuid }),
      execute: async ({ pageId }) => {
        const page = await getKnowledgePageQuery(orgId, pageId);
        return page ? compactPage(page) : NOT_FOUND;
      },
    }),

    searchPages: tool({
      description:
        'Find pages whose title or text contains the given words. Use to find duplicates and related pages.',
      inputSchema: z.object({ text: z.string().min(2).max(200) }),
      execute: async ({ text }) => ({
        pages: await searchKnowledgePagesQuery(orgId, text),
      }),
    }),

    getNeighbourhood: tool({
      description:
        'The pages connected to one page in the graph, within one or two hops, with how each edge was established (EXTRACTED from a source, INFERRED by a model, AMBIGUOUS).',
      inputSchema: z.object({
        pageId: dbUuid,
        hops: z.union([z.literal(1), z.literal(2)]).default(1),
      }),
      execute: async ({ pageId, hops }) => {
        const graph = await getBrainGraphQuery(orgId, {
          focus: pageId,
          hops,
          budget: 150,
          includeInferred: true,
        });
        if (!graph.nodes.some((n) => n.id === pageId)) {
          return NOT_FOUND;
        }
        const title = new Map(graph.nodes.map((n) => [n.id, n.title]));
        return {
          pages: graph.nodes.slice(0, TOOL_LIST_LIMIT).map((n) => ({
            pageId: n.id,
            title: n.title,
            type: n.type,
            status: n.status,
            openFindings: n.openFindings,
          })),
          edges: graph.edges.slice(0, TOOL_LIST_LIMIT * 2).map((e) => ({
            from: title.get(e.from) ?? e.from,
            to: title.get(e.to) ?? e.to,
            fromPageId: e.from,
            toPageId: e.to,
            kind: e.kind,
            origin: e.origin,
          })),
        };
      },
    }),

    getSourceSpan: tool({
      description:
        "The passage around one of a page's quotes, from the document version the curator read, and whether the document's current version still contains the quote.",
      inputSchema: z.object({
        pageId: dbUuid,
        sourceId: z.number().int().positive(),
      }),
      execute: async ({ pageId, sourceId }) =>
        (await getSourceSpanQuery(orgId, pageId, sourceId)) ?? NOT_FOUND,
    }),

    getDecisions: tool({
      description:
        'The decision ledger (who approved, rejected, merged, published… which page) over the last N days, newest first.',
      inputSchema: z.object({
        days: z.number().int().min(1).max(90).default(7),
      }),
      execute: async ({ days }) => ({
        decisions: await getKnowledgeDecisionsQuery(
          orgId,
          new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          TOOL_LIST_LIMIT * 2,
        ),
      }),
    }),

    listDocuments: tool({
      description:
        'The documents Brain reads, with how many approved and candidate pages cite each and whether each is in retrieval.',
      inputSchema: z.object({}),
      execute: async () => {
        const documents = await getBrainDocumentsQuery(orgId);
        return {
          total: documents.length,
          documents: documents.slice(0, TOOL_LIST_LIMIT * 2),
        };
      },
    }),

    listMembersAndTeams: tool({
      description:
        'Who may be named owner of a page, or granted access: the members (with their user ids) and teams (with their ids).',
      inputSchema: z.object({}),
      execute: async () => {
        const options = await getBrainReviewOptionsQuery(orgId);
        return {
          members: options.members.slice(0, 100),
          teams: options.teams.slice(0, 100),
        };
      },
    }),
  };

  if (!context.canWrite) {
    return read;
  }

  return {
    ...read,
    proposeChange: tool({
      description: PROPOSE_DESCRIPTION,
      // One flat object rather than the union: several providers accept only
      // an object at the top of a tool's parameters. The union is the check,
      // applied below.
      inputSchema: z.object({
        action: z.enum([
          'APPROVE',
          'REJECT',
          'PUBLISH',
          'UNPUBLISH',
          'MERGE',
          'SET_OWNER',
          'SET_ACCESS',
          'RETRY_EXTRACTION',
        ]),
        reason: z.string(),
        pageIds: z.array(z.string()).optional(),
        pageId: z.string().optional(),
        sourcePageId: z.string().optional(),
        targetPageId: z.string().optional(),
        ownerId: z.string().optional(),
        principals: z.array(z.string()).optional(),
        findingId: z.string().optional(),
      }),
      execute: async (input) => {
        const parsed = brainProposalInputSchema.safeParse(input);
        if (!parsed.success) {
          context.onProposalDropped();
          return { shown: false, error: 'invalid-proposal' };
        }
        const proposal = await buildBrainProposalQuery(orgId, parsed.data);
        if (typeof proposal === 'string') {
          return { shown: false, error: proposal };
        }
        context.onProposal(proposal);
        return {
          shown: true,
          note: 'Shown to the operator as a card. Nothing has changed until they press Apply; do not say it is done.',
        };
      },
    }),
  };
}

export type BrainAssistantTools = ReturnType<typeof createBrainAssistantTools>;

const NOT_FOUND = { error: 'not-found' } as const;

const PROPOSE_DESCRIPTION = `Suggest a change to Brain. It is shown to the operator as a card with Apply and Dismiss; nothing changes unless they apply it. Never claim a change was made.
Shapes:
- APPROVE | REJECT | PUBLISH | UNPUBLISH: pageIds (1-30), reason
- MERGE: sourcePageId (the candidate folded away), targetPageId (the page that stays), reason
- SET_OWNER: pageId, ownerId (a member's user id from listMembersAndTeams), reason
- SET_ACCESS: pageId, principals (the complete new list: "org:<orgId>", "user:<userId>", "team:<teamId>"), reason
- RETRY_EXTRACTION: findingId (an open EXTRACTION_FAILED finding), reason`;

function compactFinding(f: KnowledgeFindingListItem) {
  return {
    findingId: f.publicId,
    type: f.type,
    severity: f.severity,
    status: f.status,
    detectedAt: f.detectedAt,
    pages: f.pages.map((p) => ({ pageId: p.publicId, title: p.title })),
    file: f.file?.name ?? null,
    summary: f.summary,
  };
}

function compactPage(page: KnowledgePageDetail) {
  return {
    pageId: page.publicId,
    title: page.title,
    type: page.type,
    status: page.status,
    owner: page.ownerName,
    ownerId: page.ownerId,
    publication: page.publication,
    publicationOutdated: page.publicationOutdated,
    access: page.access,
    principals: page.principals,
    lastVerifiedAt: page.lastVerifiedAt,
    verifyEvery: page.verifyEvery,
    updatedAt: page.updatedAt,
    supersededBy: page.supersededBy
      ? { pageId: page.supersededBy.publicId, title: page.supersededBy.title }
      : null,
    text:
      page.content.length > PAGE_TEXT_LIMIT
        ? `${page.content.slice(0, PAGE_TEXT_LIMIT)}…`
        : page.content,
    sources: page.sources.map((s) => ({
      sourceId: s.id,
      file: s.fileName,
      documentId: s.documentId,
      span: s.span,
      quote: s.quote,
      state: s.state,
      pinnedVersion: s.pinnedVersion,
    })),
    relations: page.edges.slice(0, TOOL_LIST_LIMIT).map((e) => ({
      direction: e.direction,
      kind: e.kind,
      origin: e.origin,
      pageId: e.page.publicId,
      title: e.page.title,
    })),
    findings: page.findings.map(compactFinding),
    decisions: page.decisions,
  };
}
