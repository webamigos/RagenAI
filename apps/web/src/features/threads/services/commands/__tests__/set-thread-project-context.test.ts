import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  permission: vi.fn(),
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: { thread: { findFirst: m.findFirst, updateMany: m.updateMany } },
}));
vi.mock(
  '@/features/projects/services/queries/get-effective-project-permission-query',
  () => ({ getEffectiveProjectPermissionQuery: m.permission }),
);

import { setThreadProjectContext } from '../set-thread-project-context';

const THREAD = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
const PROJECT = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b';
const OWNED = {
  id: THREAD,
  organizationId: 'org-1',
  OR: [{ userId: 'user-1' }, { visitorId: 'user-1' }],
};
const change = (mentionedProjectId: string | null, threadId = THREAD) =>
  setThreadProjectContext({
    threadId,
    organizationId: 'org-1',
    userId: 'user-1',
    mentionedProjectId,
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.findFirst.mockResolvedValue({ id: THREAD });
  m.updateMany.mockResolvedValue({ count: 1 });
  m.permission.mockResolvedValue({ canView: true });
});

describe('setThreadProjectContext', () => {
  it('points the caller’s own thread at a project they can see, writing under the same scope', async () => {
    expect(await change(PROJECT)).toEqual({
      status: 'ok',
      mentionedProjectId: PROJECT,
    });
    expect(m.findFirst.mock.calls[0][0].where).toEqual(OWNED);
    expect(m.permission).toHaveBeenCalledWith(PROJECT, 'org-1', 'user-1');
    expect(m.updateMany).toHaveBeenCalledWith({
      where: OWNED,
      data: { mentionedProjectId: PROJECT },
    });
  });

  it('refuses a thread that is not the caller’s — another member’s, or another org’s — as not found', async () => {
    m.findFirst.mockResolvedValue(null);
    expect(await change(PROJECT)).toEqual({ status: 'thread-not-found' });
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a project the caller cannot see, even in their own organization', async () => {
    m.permission.mockResolvedValue({ canView: false });
    expect(await change(PROJECT)).toEqual({ status: 'project-not-found' });
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it('clears the context without asking about any project', async () => {
    expect(await change(null)).toEqual({
      status: 'ok',
      mentionedProjectId: null,
    });
    expect(m.permission).not.toHaveBeenCalled();
    expect(m.updateMany).toHaveBeenCalledWith({
      where: OWNED,
      data: { mentionedProjectId: null },
    });
  });

  it('reports a write that matched nothing as not found', async () => {
    m.updateMany.mockResolvedValue({ count: 0 });
    expect(await change(null)).toEqual({ status: 'thread-not-found' });
  });

  // The columns are Postgres `uuid`s, which take any 8-4-4-4-12 hex id. The
  // e2e seed's fixed ids carry no RFC 4122 version; a strict check refused
  // them as a missing thread and a missing project.
  it('accepts a seeded id with no RFC 4122 version, as the column does', async () => {
    const seededThread = 'e2e00000-0000-0000-0000-00e2e0000010';
    const seededProject = 'e2e00000-0000-0000-0000-00e2e0000001';
    expect(await change(seededProject, seededThread)).toEqual({
      status: 'ok',
      mentionedProjectId: seededProject,
    });
  });

  it('rejects ids that are not UUIDs before querying', async () => {
    expect(await change(null, 'not-a-uuid')).toEqual({
      status: 'thread-not-found',
    });
    expect(await change('not-a-uuid')).toEqual({
      status: 'project-not-found',
    });
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});
