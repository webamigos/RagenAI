import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  session: vi.fn(),
  orgId: vi.fn(),
  findThread: vi.fn(),
  shared: vi.fn(),
  member: vi.fn(),
  fetchMessages: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: () => m.session() } },
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuth: () => m.orgId(),
}));
vi.mock('@ragenai/prisma-client', () => ({
  default: { thread: { findFirst: (args: unknown) => m.findThread(args) } },
}));
vi.mock(
  '@/features/threads/services/queries/is-thread-shared-with-user-query',
  () => ({
    isThreadSharedWithUserQuery: (threadId: string, userId: string) =>
      m.shared(threadId, userId),
  }),
);
vi.mock('@/lib/auth-guards', () => ({
  getActiveMember: () => m.member(),
}));
vi.mock(
  '@/features/messages/services/queries/get-thread-messages-query',
  () => ({
    getThreadMessagesQuery: (...args: unknown[]) => m.fetchMessages(...args),
  }),
);
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import type { NextRequest } from 'next/server';
import { GET } from '../route';

const OWNER = 'user-owner';
const READER = 'user-reader';
const THREAD = 'thread-1';

const get = (visitorId = READER) =>
  GET(new Request('http://localhost/api/messages') as unknown as NextRequest, {
    params: Promise.resolve({ threadId: [THREAD, visitorId] }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.session.mockResolvedValue({ user: { id: READER } });
  m.orgId.mockResolvedValue('org-1');
  m.findThread.mockResolvedValue({ id: THREAD, visitorId: OWNER });
  m.shared.mockResolvedValue(false);
  m.member.mockResolvedValue({ role: 'member' });
  m.fetchMessages.mockResolvedValue({ messages: [], threadContext: null });
});

describe('GET /api/messages/[threadId]/[visitorId]', () => {
  it('finds the thread only inside the session’s organization', async () => {
    m.findThread.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(m.findThread.mock.calls[0][0].where).toEqual({
      id: THREAD,
      organizationId: 'org-1',
    });
    expect(m.fetchMessages).not.toHaveBeenCalled();
  });

  it('serves the owner read-write, under their own visitor id', async () => {
    m.session.mockResolvedValue({ user: { id: OWNER } });
    const res = await get(OWNER);
    expect(res.status).toBe(200);
    expect((await res.json()).isReadOnly).toBe(false);
    expect(m.fetchMessages).toHaveBeenCalledWith(THREAD, OWNER, {
      guestOnly: false,
    });
  });

  it('serves a member the thread was shared with, read-only, as the owner’s thread', async () => {
    m.shared.mockResolvedValue(true);
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).isReadOnly).toBe(true);
    expect(m.shared).toHaveBeenCalledWith(THREAD, READER);
    expect(m.fetchMessages).toHaveBeenCalledWith(THREAD, OWNER, {
      guestOnly: false,
    });
  });

  it('still serves an org admin, read-only', async () => {
    m.member.mockResolvedValue({ role: 'admin' });
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).isReadOnly).toBe(true);
    expect(m.fetchMessages).toHaveBeenCalledWith(THREAD, OWNER, {
      guestOnly: false,
    });
  });

  it('refuses a member it was not shared with, as not found', async () => {
    const res = await get();
    expect(res.status).toBe(404);
    expect(m.fetchMessages).not.toHaveBeenCalled();
  });

  it('reads guest threads only when there is no session', async () => {
    m.session.mockResolvedValue(null);
    const res = await get('visitor_abc');
    expect(res.status).toBe(200);
    expect((await res.json()).isReadOnly).toBe(false);
    expect(m.findThread).not.toHaveBeenCalled();
    expect(m.fetchMessages).toHaveBeenCalledWith(THREAD, 'visitor_abc', {
      guestOnly: true,
    });
  });

  it('asks for a guest thread even when the visitor id is a user id', async () => {
    m.session.mockResolvedValue(null);
    await get(OWNER);
    expect(m.fetchMessages).toHaveBeenCalledWith(THREAD, OWNER, {
      guestOnly: true,
    });
  });
});
