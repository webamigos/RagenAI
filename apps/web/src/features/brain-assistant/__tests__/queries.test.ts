import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const db = vi.hoisted(() => ({
  thread: { findMany: vi.fn(), findFirst: vi.fn() },
  knowledgeFinding: { findFirst: vi.fn() },
  knowledgePage: { findFirst: vi.fn() },
  userFile: { findMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
vi.mock('@ragenai/crypto', () => ({
  decryptMessageContents: vi.fn(async (messages: unknown[]) => messages),
}));

const {
  getBrainAssistantThreadsQuery,
  getBrainAssistantThreadQuery,
  historyForModel,
} = await import('../services/queries/get-brain-assistant-threads-query');
const { describeScreenQuery } =
  await import('../services/queries/describe-screen-query');

const owner = { orgId: 'org-1', userId: 'u-1' };
const ID = '11111111-2222-4333-8444-555555555555';

beforeEach(() => vi.clearAllMocks());

describe('the conversation queries', () => {
  it('list only this person’s Brain conversations in this organization', async () => {
    db.thread.findMany.mockResolvedValue([
      { id: 't', title: 'Leave', createdAt: new Date(0), encryptedDek: null },
    ]);
    expect(await getBrainAssistantThreadsQuery(owner)).toEqual([
      { id: 't', title: 'Leave', createdAt: new Date(0).toISOString() },
    ]);
    expect(db.thread.findMany.mock.calls[0]![0].where).toEqual({
      organizationId: 'org-1',
      visitorId: 'u-1',
      kind: 'BRAIN_OPERATOR',
      messages: { some: {} },
    });
  });

  it('open a conversation only as its owner’s, and decode its turns', async () => {
    db.thread.findFirst.mockResolvedValue(null);
    expect(await getBrainAssistantThreadQuery(owner, ID)).toBeNull();
    expect(db.thread.findFirst.mock.calls[0]![0].where).toEqual({
      id: ID,
      organizationId: 'org-1',
      visitorId: 'u-1',
      kind: 'BRAIN_OPERATOR',
    });

    db.thread.findFirst.mockResolvedValue({
      id: ID,
      encryptedDek: null,
      messages: [
        { id: 'a', role: 'USER', content: 'q', createdAt: new Date(0) },
        {
          id: 'b',
          role: 'ASSISTANT',
          content: JSON.stringify({ v: 1, text: 'ans', proposals: [] }),
          createdAt: new Date(0),
        },
      ],
    });
    const thread = await getBrainAssistantThreadQuery(owner, ID);
    expect(thread?.messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'q'],
      ['assistant', 'ans'],
    ]);
  });

  it('tell the model what became of a proposal, and nothing of a withheld answer', () => {
    const history = historyForModel([
      {
        id: '1',
        role: 'user',
        text: 'q',
        proposals: [],
        refused: false,
        createdAt: '',
      },
      {
        id: '2',
        role: 'assistant',
        text: 'try this',
        proposals: [
          {
            id: 'p',
            action: 'APPROVE',
            reason: 'r',
            outcome: { status: 'dismissed', at: '' },
            pages: [],
          },
        ],
        refused: false,
        createdAt: '',
      },
      {
        id: '3',
        role: 'assistant',
        text: 'secret',
        proposals: [],
        refused: true,
        createdAt: '',
      },
    ]);
    expect(history[1]!.content).toContain('[proposal APPROVE: dismissed]');
    expect(history[2]!.content).not.toContain('secret');
  });
});

describe('describeScreenQuery', () => {
  it('names a page the organization holds, and nothing for one it does not', async () => {
    db.knowledgePage.findFirst.mockResolvedValueOnce({
      publicId: ID,
      title: 'Leave policy',
      status: 'CANDIDATE',
    });
    expect(
      await describeScreenQuery('org-1', { view: 'page', pageId: ID }),
    ).toContain('"Leave policy"');
    expect(db.knowledgePage.findFirst.mock.calls[0]![0].where).toEqual({
      organizationId: 'org-1',
      publicId: ID,
    });
    db.knowledgePage.findFirst.mockResolvedValueOnce(null);
    const unknown = await describeScreenQuery('org-1', {
      view: 'page',
      pageId: ID,
    });
    expect(unknown).not.toContain(ID);
  });

  it('describes a finding only when it is the organization’s', async () => {
    db.knowledgeFinding.findFirst.mockResolvedValueOnce(null);
    expect(
      await describeScreenQuery('org-1', { view: 'finding', findingId: ID }),
    ).toBe('The findings inbox.');
  });
});
