import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The assistant's actions are a boundary, like the review actions: who may
 * call them, and that Apply runs Brain's own actions with the stored
 * proposal — never one taken from the request.
 */

const m = vi.hoisted(() => ({
  access: vi.fn(),
  userId: vi.fn(),
  read: vi.fn(),
  record: vi.fn(),
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
  () => ({
    readStoredProposalQuery: m.read,
    recordProposalOutcomeCommand: m.record,
  }),
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
  m.read.mockResolvedValue(approve);
  m.record.mockImplementation(async (_o, _t, _m, _p, outcome) => ({
    ...approve,
    outcome,
  }));
  m.approve.mockResolvedValue({ success: true, changed: true });
});

describe('applyBrainProposalAction', () => {
  it('runs Brain’s own action for the stored proposal and records the outcome', async () => {
    const result = await actions.applyBrainProposalAction({
      ...ref,
      // Forged: the proposal is read back from the conversation.
      proposal: { action: 'PUBLISH', pages: [page] },
      orgId: 'org-forged',
    });
    expect(m.read).toHaveBeenCalledWith(
      { orgId: 'org-session', userId: 'u-session', canWrite: true },
      ID,
      MSG,
      'p-1',
    );
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
    expect(m.read).not.toHaveBeenCalled();
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

  it('does not run a proposal already applied or dismissed', async () => {
    m.read.mockResolvedValue({
      ...approve,
      outcome: { status: 'dismissed', at: 'x' },
    });
    expect(await actions.applyBrainProposalAction(ref)).toEqual({
      success: false,
      error: 'already-decided',
    });
    expect(m.approve).not.toHaveBeenCalled();
  });

  it('records a refused step with the command’s own code', async () => {
    m.approve.mockResolvedValue({ success: false, error: 'owner-required' });
    const result = await actions.applyBrainProposalAction(ref);
    expect(m.record).toHaveBeenCalledWith(
      expect.anything(),
      ID,
      MSG,
      'p-1',
      expect.objectContaining({
        status: 'applied',
        results: [{ label: 'Leave', ok: false, error: 'owner-required' }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('asks before widening access, and records nothing until the operator answers', async () => {
    m.read.mockResolvedValue({
      id: 'p-1',
      action: 'SET_ACCESS',
      reason: 'r',
      outcome: null,
      page,
      principals: ['org:org-session'],
      preview: { before: [], after: [], widens: true },
    });
    m.setAccess.mockResolvedValueOnce({
      success: false,
      error: 'confirm-widening',
    });
    expect(await actions.applyBrainProposalAction(ref)).toEqual({
      success: false,
      error: 'confirm-widening',
    });
    expect(m.record).not.toHaveBeenCalled();

    m.setAccess.mockResolvedValueOnce({ success: true, changed: true });
    await actions.applyBrainProposalAction({ ...ref, confirmWidening: true });
    expect(m.setAccess).toHaveBeenLastCalledWith(
      expect.objectContaining({ confirmWidening: true }),
    );
    expect(m.record).toHaveBeenCalledTimes(1);
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
    expect(m.record).toHaveBeenCalledWith(
      { orgId: 'org-session', userId: 'u-session', canWrite: true },
      ID,
      MSG,
      'p-1',
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
