import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const m = vi.hoisted(() => {
  const client = {
    thread: { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
    message: { updateMany: vi.fn() },
    $queryRaw: vi.fn(),
  };
  return {
    db: {
      ...client,
      $transaction: vi.fn(async (fn: (tx: typeof client) => unknown) =>
        fn(client),
      ),
    },
    encrypt: vi.fn(
      async (_threadId: string, content: string) => `enc(${content})`,
    ),
    createMessage: vi.fn(),
  };
});
vi.mock('@ragenai/prisma-client', () => ({ default: m.db }));
vi.mock('@ragenai/crypto', () => ({
  decryptMessageContents: vi.fn(async (messages: unknown[]) => messages),
}));
vi.mock('@/features/messages/services/thread-content-encryption', () => ({
  maybeEncryptContent: m.encrypt,
}));
vi.mock('@/features/messages/services/commands/create-message-command', () => ({
  createMessageInDbCommand: m.createMessage,
}));

const commands =
  await import('../services/commands/brain-assistant-thread-commands');

const owner = { orgId: 'org-1', userId: 'u-1' };
const proposal = {
  id: 'p-1',
  action: 'APPROVE',
  reason: 'r',
  outcome: null,
  pages: [{ publicId: 'a', title: 'A', updatedAt: 'u' }],
};
const stored = (p: object) =>
  JSON.stringify({ v: 1, text: 'answer', proposals: [p] });

beforeEach(() => vi.clearAllMocks());

describe('createBrainAssistantThreadCommand', () => {
  it('creates a BRAIN_OPERATOR thread owned by the person, its title encrypted', async () => {
    m.db.thread.create.mockResolvedValue({ id: 't-1' });
    expect(
      await commands.createBrainAssistantThreadCommand(
        owner,
        'Who owns leave?',
      ),
    ).toBe('t-1');
    expect(m.db.thread.create.mock.calls[0]![0].data).toMatchObject({
      organizationId: 'org-1',
      visitorId: 'u-1',
      kind: 'BRAIN_OPERATOR',
    });
    expect(m.encrypt).toHaveBeenCalledWith('t-1', 'Who owns leave?');
    expect(m.db.thread.updateMany).toHaveBeenCalledWith({
      where: { id: 't-1', organizationId: 'org-1' },
      data: { title: 'enc(Who owns leave?)' },
    });
  });
});

describe('storing turns', () => {
  it('stores the answer and its proposals as one message, through the thread’s encryption path', async () => {
    m.createMessage.mockResolvedValue({ id: 'msg-1' });
    await commands.storeBrainAssistantAnswerCommand(owner, 't-1', 'answer', [
      proposal as never,
    ]);
    const call = m.createMessage.mock.calls[0]![0];
    expect(call.role).toBe('ASSISTANT');
    expect(JSON.parse(call.message.content)).toEqual({
      v: 1,
      text: 'answer',
      proposals: [proposal],
    });
    // Nothing of the proposal sits in the plaintext metadata column.
    expect(call.message.metadata).toBeUndefined();
  });
});

describe('transitionProposalCommand', () => {
  const NOW = new Date('2026-09-25T10:00:00.000Z');
  const stored1 = (outcome: object | null) => {
    m.db.$queryRaw.mockResolvedValue([{ id: 'msg-1' }]);
    m.db.thread.findFirst.mockResolvedValue({
      encryptedDek: null,
      messages: [{ content: stored({ ...proposal, outcome }) }],
    });
  };

  it('claims an undecided card, re-encrypting the message', async () => {
    stored1(null);
    const claim = { status: 'applying' as const, at: NOW.toISOString() };
    const result = await commands.transitionProposalCommand(
      owner,
      't-1',
      'msg-1',
      'p-1',
      'undecided',
      claim,
      NOW,
    );
    expect(result).toMatchObject({ id: 'p-1', outcome: claim });
    const content = m.encrypt.mock.calls[0]![1];
    expect(JSON.parse(content).proposals[0].outcome).toEqual(claim);
    expect(m.db.message.updateMany).toHaveBeenCalledWith({
      where: { id: 'msg-1', threadId: 't-1' },
      data: { content: `enc(${content})` },
    });
  });

  it('refuses a second claim, and a dismissal, while another Apply holds the card', async () => {
    stored1({ status: 'applying', at: NOW.toISOString() });
    for (const next of [
      { status: 'applying' as const, at: NOW.toISOString() },
      { status: 'dismissed' as const, at: NOW.toISOString() },
    ]) {
      expect(
        await commands.transitionProposalCommand(
          owner,
          't-1',
          'msg-1',
          'p-1',
          'undecided',
          next,
          NOW,
        ),
      ).toBe('already-decided');
    }
    expect(m.db.message.updateMany).not.toHaveBeenCalled();
  });

  it('takes over a claim old enough to be a dead Apply’s', async () => {
    stored1({
      status: 'applying',
      at: new Date(
        NOW.getTime() - commands.APPLY_CLAIM_TTL_MS - 1,
      ).toISOString(),
    });
    expect(
      await commands.transitionProposalCommand(
        owner,
        't-1',
        'msg-1',
        'p-1',
        'undecided',
        { status: 'applying', at: NOW.toISOString() },
        NOW,
      ),
    ).toMatchObject({ outcome: { status: 'applying' } });
  });

  it('finishes or releases only a claimed card', async () => {
    stored1({ status: 'applying', at: NOW.toISOString() });
    expect(
      await commands.transitionProposalCommand(
        owner,
        't-1',
        'msg-1',
        'p-1',
        'applying',
        null,
        NOW,
      ),
    ).toMatchObject({ outcome: null });
    stored1({ status: 'dismissed', at: 'x' });
    expect(
      await commands.transitionProposalCommand(
        owner,
        't-1',
        'msg-1',
        'p-1',
        'applying',
        { status: 'applied', at: 'y', results: [] },
        NOW,
      ),
    ).toBe('already-decided');
  });

  it('finds nothing in someone else’s conversation', async () => {
    m.db.$queryRaw.mockResolvedValue([]);
    expect(
      await commands.transitionProposalCommand(
        owner,
        't-1',
        'msg-1',
        'p-1',
        'undecided',
        { status: 'dismissed', at: 'y' },
      ),
    ).toBe('not-found');
    expect(m.db.thread.findFirst).not.toHaveBeenCalled();
  });
});
