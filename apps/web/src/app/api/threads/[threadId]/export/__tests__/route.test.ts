import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  userId: vi.fn(),
  findThread: vi.fn(),
  shared: vi.fn(),
  member: vi.fn(),
}));

vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuth: async () => 'org-1',
  getCurrentUserId: () => m.userId(),
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
vi.mock('@/lib/auth-guards', () => ({ getActiveMember: () => m.member() }));
vi.mock('@ragenai/crypto', () => ({
  decryptMessageContents: async (messages: unknown[]) => messages,
}));
// Only the markdown path runs here; the PDF renderer never loads.
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: vi.fn() }));
vi.mock('@/features/threads/utils/ThreadPDF', () => ({
  ThreadPDF: () => null,
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';

const exportAs = () =>
  GET(new NextRequest('http://localhost/api/threads/t1/export?format=md'), {
    params: Promise.resolve({ threadId: 't1' }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.userId.mockResolvedValue('user-reader');
  m.findThread.mockResolvedValue({
    id: 't1',
    title: 'Wątek',
    createdAt: new Date('2026-10-01T08:00:00Z'),
    userId: 'user-owner',
    encryptedDek: null,
    messages: [],
    threadDocuments: [],
    project: null,
  });
  m.shared.mockResolvedValue(false);
  m.member.mockResolvedValue({ role: 'member' });
});

describe('GET /api/threads/[threadId]/export', () => {
  it('lets a member the thread was shared with export it', async () => {
    m.shared.mockResolvedValue(true);
    const res = await exportAs();
    expect(res.status).toBe(200);
    expect(m.shared).toHaveBeenCalledWith('t1', 'user-reader');
    expect(m.member).not.toHaveBeenCalled();
  });

  it('refuses a member it was not shared with', async () => {
    const res = await exportAs();
    expect(res.status).toBe(403);
  });

  it('still lets an org admin export it', async () => {
    m.member.mockResolvedValue({ role: 'admin' });
    const res = await exportAs();
    expect(res.status).toBe(200);
  });
});
