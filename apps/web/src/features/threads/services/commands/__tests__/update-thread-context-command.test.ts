import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  orgId: vi.fn(),
  userId: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: () => m.orgId(),
  getCurrentUserId: () => m.userId(),
}));
vi.mock('../set-thread-project-context', () => ({
  setThreadProjectContext: (args: unknown) => m.set(args),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import * as actions from '../update-thread-context-command';

beforeEach(() => {
  vi.clearAllMocks();
  m.orgId.mockResolvedValue('org-1');
  m.userId.mockResolvedValue('user-1');
  m.set.mockResolvedValue({ status: 'ok', mentionedProjectId: 'p1' });
});

describe('updateThreadContextCommand', () => {
  it('acts as the session’s user in the session’s organization', async () => {
    expect(await actions.updateThreadContextCommand('t1', 'p1')).toEqual({
      success: true,
      mentionedProjectId: 'p1',
    });
    expect(m.set).toHaveBeenCalledWith({
      threadId: 't1',
      organizationId: 'org-1',
      userId: 'user-1',
      mentionedProjectId: 'p1',
    });
  });

  it('refuses without a signed-in user', async () => {
    m.userId.mockResolvedValue(null);
    expect(await actions.updateThreadContextCommand('t1', null)).toEqual({
      success: false,
      errorMessage: 'Unauthorized',
    });
    expect(m.set).not.toHaveBeenCalled();
  });

  it('says why a change was refused', async () => {
    m.set.mockResolvedValue({ status: 'thread-not-found' });
    expect((await actions.updateThreadContextCommand('t1', null)).success).toBe(
      false,
    );
    m.set.mockResolvedValue({ status: 'project-not-found' });
    expect(await actions.updateThreadContextCommand('t1', 'p2')).toEqual({
      success: false,
      errorMessage: 'Project not found or access denied',
    });
  });

  // A 'use server' module's every export is an endpoint. The setter takes
  // the caller's ids as arguments, so it must never be one of them.
  it('exports the guarded action and nothing that takes ids from its caller', () => {
    expect(Object.keys(actions)).toEqual(['updateThreadContextCommand']);
  });
});
