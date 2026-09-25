import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The assistant's actions are a boundary, like the review actions: who may
 * call them, and that Apply runs Brain's own actions with the stored
 * proposal — never one taken from the request.
 */

const m = vi.hoisted(() => ({
  access: vi.fn(),
  userId: vi.fn(),
  transition: vi.fn(),
  threads: vi.fn(),
  thread: vi.fn(),
  approve: vi.fn(),
  setAccess: vi.fn(),
}));

vi.mock('@/features/brain/services/queries/get-brain-access-query', () => ({
  getBrainAccessQuery: m.access,
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getCurrentUserId: m.userId,
}));
vi.mock(
  '@/features/brain-assistant/services/commands/brain-assistant-thread-commands',
  () => ({ transitionProposalCommand: m.transition }),
);
vi.mock(
  '@/features/brain-assistant/services/queries/get-brain-assistant-threads-query',
  () => ({
    getBrainAssistantThreadsQuery: m.threads,
    getBrainAssistantThreadQuery: m.thread,
  }),
);
vi.mock('../actions', () => ({
  approveKnowledgePageAction: m.approve,
  rejectKnowledgePageAction: vi.fn(),
  publishKnowledgePageAction: vi.fn(),
  unpublishKnowledgePageAction: vi.fn(),
  mergeKnowledgePagesAction: vi.fn(),
  setKnowledgePageOwnerAction: vi.fn(),
  setKnowledgePageAccessAction: m.setAccess,
  retryExtractionFindingAction: vi.fn(),
}));

const actions = await import('../assistant-actions');

const ID = '11111111-2222-4333-8444-555555555555';
const MSG = '22222222-2222-4333-8444-555555555555';
const ref = { threadId: ID, messageId: MSG, proposalId: 'p-1' };
const page = {
  publicId: ID,
  title: 'Leave',
  updatedAt: '2026-09-25T10:00:00.000Z',
};
const approve = {
  id: 'p-1',
  action: 'APPROVE',
  reason: 'r',
  outcome: null,
  pages: [page],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({
    orgId: 'org-session',
    access: 'write',
    canWrite: true,
    assistant: true,
  });
  m.userId.mockResolvedValue('u-session');
  m.transition.mockImplementation(async (_o, _t, _m, _p, _from, next) => ({
    ...approve,
    outcome: next,
  }));
  m.approve.mockResolvedValue({ success: true, changed: true });
});

const owner = { orgId: 'org-session', userId: 'u-session', canWrite: true };

describe('applyBrainProposalAction', () => {
  it('claims the stored proposal first, runs Brain’s own action, then records the outcome', async () => {
    const order: string[] = [];
    m.transition.mockImplementation(async (_o, _t, _m, _p, from, next) => {
      order.push(`${from}->${next?.status ?? 'null'}`);
      return { ...approve, outcome: next };
    });
    m.approve.mockImplementation(async () => {
      order.push('approve');
      return { success: true, changed: true };
    });
    const result = await actions.applyBrainProposalAction({
      ...ref,
      // Forged: the proposal is read back from the conversation.
      proposal: { action: 'PUBLISH', pages: [page] },
      orgId: 'org-forged',
    });
    expect(order).toEqual([
      'undecided->applying',
      'approve',
      'applying->applied',
    ]);
    expect(m.transition.mock.calls[0]!.slice(0, 4)).toEqual([
      owner,
      ID,
      MSG,
      'p-1',
    ]);
    expect(m.approve).toHaveBeenCalledWith({
      publicId: ID,
      expectedUpdatedAt: page.updatedAt,
    });
    expect(result).toMatchObject({
      success: true,
      proposal: {
        outcome: { status: 'applied', results: [{ label: 'Leave', ok: true }] },
      },
    });
  });

  it('runs nothing when the card is already taken — applied, dismissed, or being applied in another tab', async () => {
    m.transition.mockResolvedValueOnce('already-decided');
    expect(await actions.applyBrainProposalAction(ref)).toEqual({
      success: false,
      error: 'already-decided',
    });
    expect(m.approve).not.toHaveBeenCalled();
    expect(m.transition).toHaveBeenCalledTimes(1);
  });

  it('refuses a read-only visitor before anything runs', async () => {
    m.access.mockResolvedValue({
      orgId: 'org-session',
      access: 'read',
      canWrite: false,
      assistant: true,
    });
    expect(await actions.applyBrainProposalAction(ref)).toEqual({
      success: false,
      error: 'read-only',
    });
    expect(m.transition).not.toHaveBeenCalled();
    expect(m.approve).not.toHaveBeenCalled();
  });

  it('answers not-found when the assistant is off or Brain is closed to the person', async () => {
    m.access.mockResolvedValue({
      orgId: 'o',
      access: 'write',
      canWrite: true,
      assistant: false,
    });
    expect(await actions.applyBrainProposalAction(ref)).toEqual({
      success: false,
      error: 'not-found',
    });
    m.access.mockResolvedValue(null);
    expect(await actions.applyBrainProposalAction(ref)).toEqual({
      success: false,
      error: 'not-found',
    });
    expect(m.approve).not.toHaveBeenCalled();
  });

  it('records a refused step with the command’s own code', async () => {
    m.approve.mockResolvedValue({ success: false, error: 'owner-required' });
    const result = await actions.applyBrainProposalAction(ref);
    expect(m.transition).toHaveBeenLastCalledWith(
      owner,
      ID,
      MSG,
      'p-1',
      'applying',
      expect.objectContaining({
        status: 'applied',
        results: [{ label: 'Leave', ok: false, error: 'owner-required' }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('releases the claim when an action throws', async () => {
    m.approve.mockRejectedValue(new Error('db down'));
    await expect(actions.applyBrainProposalAction(ref)).rejects.toThrow(
      'db down',
    );
    expect(m.transition).toHaveBeenLastCalledWith(
      owner,
      ID,
      MSG,
      'p-1',
      'applying',
      null,
    );
  });

  it('asks before widening access, releasing the claim and recording nothing until the operator answers', async () => {
    const widen = {
      id: 'p-1',
      action: 'SET_ACCESS',
      reason: 'r',
      outcome: null,
      page,
      principals: ['org:org-session'],
      preview: { before: [], after: [], widens: true },
    };
    m.transition.mockImplementation(async (_o, _t, _m, _p, _from, next) => ({
      ...widen,
      outcome: next,
    }));
    m.setAccess.mockResolvedValueOnce({
      success: false,
      error: 'confirm-widening',
    });
    expect(await actions.applyBrainProposalAction(ref)).toEqual({
      success: false,
      error: 'confirm-widening',
    });
    expect(m.transition).toHaveBeenLastCalledWith(
      owner,
      ID,
      MSG,
      'p-1',
      'applying',
      null,
    );

    m.setAccess.mockResolvedValueOnce({ success: true, changed: true });
    await actions.applyBrainProposalAction({ ...ref, confirmWidening: true });
    expect(m.setAccess).toHaveBeenLastCalledWith(
      expect.objectContaining({ confirmWidening: true }),
    );
    expect(m.transition).toHaveBeenLastCalledWith(
      owner,
      ID,
      MSG,
      'p-1',
      'applying',
      expect.objectContaining({ status: 'applied' }),
    );
  });

  it('refuses malformed input', async () => {
    expect(await actions.applyBrainProposalAction({ threadId: 'x' })).toEqual({
      success: false,
      error: 'invalid-input',
    });
  });
});

describe('dismissBrainProposalAction', () => {
  it('records a dismissal and runs nothing', async () => {
    const result = await actions.dismissBrainProposalAction(ref);
    expect(m.transition).toHaveBeenCalledWith(
      owner,
      ID,
      MSG,
      'p-1',
      'undecided',
      expect.objectContaining({ status: 'dismissed' }),
    );
    expect(m.approve).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});

describe('the history actions', () => {
  it('list and open only the session person’s conversations', async () => {
    m.threads.mockResolvedValue([]);
    await actions.listBrainAssistantThreadsAction();
    expect(m.threads).toHaveBeenCalledWith({
      orgId: 'org-session',
      userId: 'u-session',
      canWrite: true,
    });
    m.thread.mockResolvedValue({ id: ID, messages: [] });
    await actions.getBrainAssistantThreadAction(ID);
    expect(m.thread).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-session' }),
      ID,
    );
  });

  it('show a read-only visitor no proposal, even one kept from before', async () => {
    m.access.mockResolvedValue({
      orgId: 'org-session',
      access: 'read',
      canWrite: false,
      assistant: true,
    });
    m.thread.mockResolvedValue({
      id: ID,
      messages: [
        {
          id: MSG,
          role: 'assistant',
          text: 't',
          proposals: [approve],
          refused: false,
          createdAt: 'x',
        },
      ],
    });
    const thread = await actions.getBrainAssistantThreadAction(ID);
    expect(thread?.messages[0]?.proposals).toEqual([]);
  });

  it('answer nothing when the assistant is off', async () => {
    m.access.mockResolvedValue({
      orgId: 'o',
      access: 'write',
      canWrite: true,
      assistant: false,
    });
    expect(await actions.listBrainAssistantThreadsAction()).toEqual([]);
    expect(await actions.getBrainAssistantThreadAction(ID)).toBeNull();
    expect(m.threads).not.toHaveBeenCalled();
  });
});
