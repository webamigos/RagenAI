import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  session: vi.fn(),
  orgId: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: () => m.session() } },
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuth: () => m.orgId(),
}));
vi.mock(
  '@/features/threads/services/commands/set-thread-project-context',
  () => ({ setThreadProjectContext: (args: unknown) => m.set(args) }),
);
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { NextRequest } from 'next/server';
import { DELETE, PATCH } from '../route';

const PROJECT = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b';
const params = { params: Promise.resolve({ threadId: 't1' }) };
const patch = (body: unknown) =>
  PATCH(
    new NextRequest('http://localhost/api/threads/t1/context', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    params,
  );
const remove = () =>
  DELETE(
    new NextRequest('http://localhost/api/threads/t1/context', {
      method: 'DELETE',
    }),
    params,
  );

beforeEach(() => {
  vi.clearAllMocks();
  m.session.mockResolvedValue({ user: { id: 'user-1' } });
  m.orgId.mockResolvedValue('org-1');
  m.set.mockResolvedValue({ status: 'ok', mentionedProjectId: PROJECT });
});

describe('PATCH /api/threads/[threadId]/context', () => {
  it('changes the context as the session’s user', async () => {
    const res = await patch({ mentionedProjectId: PROJECT });
    expect(res.status).toBe(200);
    expect(m.set).toHaveBeenCalledWith({
      threadId: 't1',
      organizationId: 'org-1',
      userId: 'user-1',
      mentionedProjectId: PROJECT,
    });
  });

  it('refuses without a session', async () => {
    m.session.mockResolvedValue(null);
    expect((await patch({ mentionedProjectId: PROJECT })).status).toBe(401);
    expect(m.set).not.toHaveBeenCalled();
  });

  it('rejects a body that is not a project id or null', async () => {
    expect((await patch({ mentionedProjectId: 'nope' })).status).toBe(400);
    expect(m.set).not.toHaveBeenCalled();
  });

  it('answers 404 for a thread that is not the caller’s, and for a project they cannot see', async () => {
    m.set.mockResolvedValue({ status: 'thread-not-found' });
    expect((await patch({ mentionedProjectId: PROJECT })).status).toBe(404);
    m.set.mockResolvedValue({ status: 'project-not-found' });
    expect((await patch({ mentionedProjectId: PROJECT })).status).toBe(404);
  });
});

describe('DELETE /api/threads/[threadId]/context', () => {
  it('clears the context of the caller’s own thread', async () => {
    m.set.mockResolvedValue({ status: 'ok', mentionedProjectId: null });
    const res = await remove();
    expect(res.status).toBe(200);
    expect(m.set).toHaveBeenCalledWith({
      threadId: 't1',
      organizationId: 'org-1',
      userId: 'user-1',
      mentionedProjectId: null,
    });
  });

  it('answers 404 for a thread that is not the caller’s', async () => {
    m.set.mockResolvedValue({ status: 'thread-not-found' });
    expect((await remove()).status).toBe(404);
  });
});
