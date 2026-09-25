import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRequest, mockGetOrgId, mockGetUserId } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockGetOrgId: vi.fn(),
  mockGetUserId: vi.fn(),
}));

vi.mock('@/libs/ragen-api-client/client', () => ({
  ragenApiRequest: mockRequest,
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuth: mockGetOrgId,
  getCurrentUserId: mockGetUserId,
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createThreadAction } from '../create-thread-command';

const requestOf = () =>
  mockRequest.mock.calls[0][0] as {
    orgId: string;
    userId: string;
    body: Record<string, unknown>;
  };
const bodyOf = () => requestOf().body;

beforeEach(() => {
  mockRequest.mockReset().mockResolvedValue({ success: true });
  mockGetOrgId.mockReset().mockResolvedValue('org-1');
  mockGetUserId.mockReset().mockResolvedValue('user-1');
});

describe('createThreadAction and the knowledge scope', () => {
  it('sends nothing when the scope is the default', async () => {
    // apps/api validates with `forbidNonWhitelisted`, so a body carrying a
    // field an older api does not know answers 400 — and thread creation is
    // the core flow. Railway cannot express "deploy api before web", so the
    // client stays quiet whenever it has nothing to say.
    await createThreadAction(undefined, undefined, 'm', [], 'KNOWLEDGE_BASE');

    expect(bodyOf()).not.toHaveProperty('knowledgeScope');
  });

  it('sends nothing when no scope was chosen', async () => {
    await createThreadAction();

    expect(bodyOf()).not.toHaveProperty('knowledgeScope');
  });

  it.each(['ASSISTANT', 'MODEL_ONLY'] as const)(
    'sends %s, which cannot be expressed by omission',
    async (scope) => {
      await createThreadAction('p1', undefined, 'm', [], scope);

      expect(bodyOf().knowledgeScope).toBe(scope);
    },
  );
});

describe('createThreadAction and the tenant scope', () => {
  // A Server Action is an endpoint: its arguments are whatever the caller
  // posts. The token apps/api trusts is minted from `orgId`/`userId`, so they
  // must be the session's, never the request's.
  it('mints the api token for the session organization and user', async () => {
    await createThreadAction('p1');

    expect(requestOf().orgId).toBe('org-1');
    expect(requestOf().userId).toBe('user-1');
  });

  it('cannot be pointed at another organization or user by its arguments', async () => {
    // The old signature was (orgId, userId, projectId, ...). A caller still
    // sending that shape must not get its values into the token.
    const call = createThreadAction as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    await call('org-victim', 'user-victim');

    expect(requestOf().orgId).toBe('org-1');
    expect(requestOf().userId).toBe('user-1');
  });

  it('refuses to create a thread with no signed-in user', async () => {
    mockGetUserId.mockResolvedValue(null);

    await expect(createThreadAction()).resolves.toEqual({
      success: false,
      errorMessage: 'Cannot create thread',
    });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('refuses to create a thread with no active organization', async () => {
    mockGetOrgId.mockResolvedValue(null);

    await expect(createThreadAction()).resolves.toEqual({
      success: false,
      errorMessage: 'Cannot create thread',
    });
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
