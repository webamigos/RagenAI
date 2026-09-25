import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const q = vi.hoisted(() => ({
  findings: vi.fn(),
  finding: vi.fn(),
  page: vi.fn(),
  search: vi.fn(),
  graph: vi.fn(),
  span: vi.fn(),
  decisions: vi.fn(),
  documents: vi.fn(),
  options: vi.fn(),
  build: vi.fn(),
}));

vi.mock(
  '@/features/brain/services/queries/get-knowledge-findings-query',
  () => ({
    getKnowledgeFindingsQuery: q.findings,
    getKnowledgeFindingQuery: q.finding,
  }),
);
vi.mock('@/features/brain/services/queries/get-knowledge-page-query', () => ({
  getKnowledgePageQuery: q.page,
}));
vi.mock(
  '@/features/brain/services/queries/search-knowledge-pages-query',
  () => ({ searchKnowledgePagesQuery: q.search }),
);
vi.mock('@/features/brain/services/queries/get-brain-graph-query', () => ({
  getBrainGraphQuery: q.graph,
}));
vi.mock('@/features/brain/services/queries/get-source-span-query', () => ({
  getSourceSpanQuery: q.span,
}));
vi.mock(
  '@/features/brain/services/queries/get-knowledge-decisions-query',
  () => ({ getKnowledgeDecisionsQuery: q.decisions }),
);
vi.mock('@/features/brain/services/queries/get-brain-documents-query', () => ({
  getBrainDocumentsQuery: q.documents,
}));
vi.mock(
  '@/features/brain/services/queries/get-brain-review-options-query',
  () => ({ getBrainReviewOptionsQuery: q.options }),
);
vi.mock('../services/queries/build-brain-proposal-query', () => ({
  buildBrainProposalQuery: q.build,
}));

const { createBrainAssistantTools } =
  await import('../services/queries/brain-assistant-tools');

const ID = '11111111-2222-4333-8444-555555555555';
const run = (tool: unknown, input: unknown) =>
  (tool as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute(
    input,
    { toolCallId: 't', messages: [] },
  );

function tools(canWrite: boolean) {
  const onProposal = vi.fn();
  const onProposalDropped = vi.fn();
  return {
    onProposal,
    onProposalDropped,
    tools: createBrainAssistantTools({
      orgId: 'org-session',
      canWrite,
      onProposal,
      onProposalDropped,
    }) as Record<string, unknown>,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the assistant’s tools', () => {
  it('offers a read-only visitor no way to propose a change', () => {
    expect(Object.keys(tools(false).tools)).not.toContain('proposeChange');
    expect(Object.keys(tools(true).tools)).toContain('proposeChange');
  });

  it('reads every tool inside the session’s organization, whatever the input says', async () => {
    const { tools: t } = tools(true);
    q.findings.mockResolvedValue({ items: [], total: 0 });
    q.finding.mockResolvedValue(null);
    q.page.mockResolvedValue(null);
    q.search.mockResolvedValue([]);
    q.graph.mockResolvedValue({ nodes: [], edges: [] });
    q.span.mockResolvedValue(null);
    q.decisions.mockResolvedValue([]);
    q.documents.mockResolvedValue([]);
    q.options.mockResolvedValue({ members: [], teams: [] });

    await run(t.listFindings, { status: 'OPEN', orgId: 'org-forged' });
    await run(t.getFinding, { findingId: ID });
    await run(t.getPage, { pageId: ID });
    await run(t.searchPages, { text: 'leave' });
    await run(t.getNeighbourhood, { pageId: ID, hops: 1 });
    await run(t.getSourceSpan, { pageId: ID, sourceId: 3 });
    await run(t.getDecisions, { days: 7 });
    await run(t.listDocuments, {});
    await run(t.listMembersAndTeams, {});

    for (const fn of [
      q.findings,
      q.finding,
      q.page,
      q.search,
      q.graph,
      q.span,
      q.decisions,
      q.documents,
      q.options,
    ]) {
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn.mock.calls[0]![0]).toBe('org-session');
    }
  });

  it('answers "not found" for an id the organization does not hold', async () => {
    const { tools: t } = tools(true);
    q.page.mockResolvedValue(null);
    q.finding.mockResolvedValue(null);
    q.graph.mockResolvedValue({ nodes: [], edges: [] });
    expect(await run(t.getPage, { pageId: ID })).toEqual({
      error: 'not-found',
    });
    expect(await run(t.getFinding, { findingId: ID })).toEqual({
      error: 'not-found',
    });
    expect(await run(t.getNeighbourhood, { pageId: ID, hops: 1 })).toEqual({
      error: 'not-found',
    });
  });

  it('filters findings by type in the query, so the total counts every match, and pages at 30', async () => {
    const { tools: t } = tools(true);
    const finding = (i: number) => ({
      publicId: `${i}`,
      type: 'STALE',
      severity: 'HIGH',
      status: 'OPEN',
      detectedAt: 'd',
      pages: [],
      file: null,
      summary: { kind: 'gap' },
    });
    q.findings.mockResolvedValue({
      items: Array.from({ length: 40 }, (_, i) => finding(i)),
      total: 250,
    });
    const stale = (await run(t.listFindings, {
      status: 'OPEN',
      type: 'STALE',
    })) as { findings: unknown[]; total: number };
    expect(q.findings).toHaveBeenCalledWith('org-session', 'OPEN', 1, 'STALE');
    expect(stale.total).toBe(250);
    expect(stale.findings).toHaveLength(30);
  });

  it('shows a proposal that fits the schema, and tells the model nothing changed', async () => {
    const { tools: t, onProposal } = tools(true);
    const proposal = { id: 'p', action: 'APPROVE' };
    q.build.mockResolvedValue(proposal);
    const result = await run(t.proposeChange, {
      action: 'APPROVE',
      pageIds: [ID],
      reason: 'All quotes verified',
    });
    expect(q.build).toHaveBeenCalledWith('org-session', {
      action: 'APPROVE',
      pageIds: [ID],
      reason: 'All quotes verified',
    });
    expect(onProposal).toHaveBeenCalledWith(proposal);
    expect(result).toMatchObject({ shown: true });
    expect(JSON.stringify(result)).toMatch(/Nothing has changed/);
  });

  it('drops a proposal outside the schema, and says so once', async () => {
    const { tools: t, onProposal, onProposalDropped } = tools(true);
    const result = await run(t.proposeChange, {
      action: 'MERGE',
      pageIds: [ID],
      reason: 'r',
    });
    expect(result).toEqual({ shown: false, error: 'invalid-proposal' });
    expect(onProposalDropped).toHaveBeenCalledTimes(1);
    expect(onProposal).not.toHaveBeenCalled();
    expect(q.build).not.toHaveBeenCalled();
  });

  it('reports a proposal the database refuses to the model, not to the panel', async () => {
    const { tools: t, onProposal, onProposalDropped } = tools(true);
    q.build.mockResolvedValue('unknown-page');
    const result = await run(t.proposeChange, {
      action: 'REJECT',
      pageIds: [ID],
      reason: 'r',
    });
    expect(result).toEqual({ shown: false, error: 'unknown-page' });
    expect(onProposal).not.toHaveBeenCalled();
    expect(onProposalDropped).not.toHaveBeenCalled();
  });

  it('trims a long page to a readable size and keeps every quote with its source id', async () => {
    const { tools: t } = tools(true);
    q.page.mockResolvedValue({
      publicId: ID,
      title: 'Leave',
      type: 'POLICY',
      status: 'CANDIDATE',
      ownerName: null,
      ownerId: null,
      publication: 'none',
      publicationOutdated: false,
      access: [],
      principals: [],
      lastVerifiedAt: null,
      verifyEvery: null,
      updatedAt: 'u',
      supersededBy: null,
      content: 'x'.repeat(10_000),
      sources: [
        {
          id: 7,
          fileName: 'hr.pdf',
          documentId: 'd',
          span: 'p.2',
          quote: '26 days',
          state: 'current',
          pinnedVersion: 1,
        },
      ],
      edges: [],
      findings: [],
      decisions: [],
    });
    const page = (await run(t.getPage, { pageId: ID })) as {
      text: string;
      sources: { sourceId: number; quote: string }[];
    };
    expect(page.text.length).toBeLessThan(4100);
    expect(page.sources).toEqual([
      expect.objectContaining({ sourceId: 7, quote: '26 days' }),
    ]);
  });
});
