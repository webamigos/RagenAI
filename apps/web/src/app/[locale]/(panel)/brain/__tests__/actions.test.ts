import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The review actions' own job is the boundary: who may call them, and that
 * the organization and actor come from the session. What each command does
 * is `features/brain/__tests__/review-commands.test.ts`'s.
 */

const access = vi.hoisted(() => ({ getBrainAccessQuery: vi.fn() }));
const auth = vi.hoisted(() => ({ getCurrentUserId: vi.fn() }));
const commands = vi.hoisted(() => ({
  approve: vi.fn(),
  reject: vi.fn(),
  owner: vi.fn(),
  access: vi.fn(),
  merge: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
}));

vi.mock(
  '@/features/brain/services/queries/get-brain-access-query',
  () => access,
);
vi.mock('@/app/lib/utils/auth-helpers', () => auth);
vi.mock(
  '@/features/brain/services/commands/approve-knowledge-page-command',
  () => ({ approveKnowledgePageCommand: commands.approve }),
);
vi.mock(
  '@/features/brain/services/commands/publish-knowledge-page-command',
  () => ({ publishKnowledgePageCommand: commands.publish }),
);
vi.mock(
  '@/features/brain/services/commands/unpublish-knowledge-page-command',
  () => ({ unpublishKnowledgePageCommand: commands.unpublish }),
);
vi.mock(
  '@/features/brain/services/commands/merge-knowledge-pages-command',
  () => ({ mergeKnowledgePagesCommand: commands.merge }),
);
vi.mock(
  '@/features/brain/services/commands/reject-knowledge-page-command',
  () => ({ rejectKnowledgePageCommand: commands.reject }),
);
vi.mock(
  '@/features/brain/services/commands/set-knowledge-page-owner-command',
  () => ({ setKnowledgePageOwnerCommand: commands.owner }),
);
vi.mock(
  '@/features/brain/services/commands/set-knowledge-page-access-command',
  () => ({ setKnowledgePageAccessCommand: commands.access }),
);

const actions = await import('../actions');

const ref = {
  publicId: '11111111-2222-4333-8444-555555555555',
  expectedUpdatedAt: '2026-09-23T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  access.getBrainAccessQuery.mockResolvedValue({ orgId: 'org-session' });
  auth.getCurrentUserId.mockResolvedValue('u-session');
  for (const command of Object.values(commands)) {
    command.mockResolvedValue({ success: true, changed: true });
  }
});

describe('Brain review actions', () => {
  it('passes the session organization and actor, never the request’s', async () => {
    await actions.approveKnowledgePageAction({
      ...ref,
      orgId: 'org-forged',
      actorId: 'u-forged',
    });
    expect(commands.approve).toHaveBeenCalledWith({
      ...ref,
      orgId: 'org-session',
      actorId: 'u-session',
    });
  });

  it('answers not-found to anyone Brain’s routes would 404', async () => {
    access.getBrainAccessQuery.mockResolvedValue(null);
    for (const call of [
      () => actions.approveKnowledgePageAction(ref),
      () => actions.rejectKnowledgePageAction(ref),
      () => actions.setKnowledgePageOwnerAction({ ...ref, ownerId: 'u1' }),
      () => actions.setKnowledgePageAccessAction({ ...ref, principals: [] }),
      () => actions.publishKnowledgePageAction(ref),
      () => actions.unpublishKnowledgePageAction(ref),
      () =>
        actions.mergeKnowledgePagesAction({
          ...ref,
          targetPublicId: '66666666-7777-4888-9999-aaaaaaaaaaaa',
        }),
    ]) {
      await expect(call()).resolves.toEqual({
        success: false,
        error: 'not-found',
      });
    }
    for (const command of Object.values(commands)) {
      expect(command).not.toHaveBeenCalled();
    }
  });

  it('refuses a malformed request before asking who is calling', async () => {
    await expect(
      actions.rejectKnowledgePageAction({ publicId: 'x' }),
    ).resolves.toEqual({ success: false, error: 'invalid-input' });
    expect(access.getBrainAccessQuery).not.toHaveBeenCalled();
  });

  it('hands the access command an explicit confirmWidening', async () => {
    await actions.setKnowledgePageAccessAction({
      ...ref,
      principals: ['user:u1'],
    });
    expect(commands.access.mock.calls[0][0]).toMatchObject({
      principals: ['user:u1'],
      confirmWidening: false,
    });
  });
});
