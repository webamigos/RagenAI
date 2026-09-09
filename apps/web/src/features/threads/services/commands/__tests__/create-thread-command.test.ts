import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('@/libs/ragen-api-client/client', () => ({
  ragenApiRequest: mockRequest,
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createThreadAction } from '../create-thread-command';

const bodyOf = () =>
  mockRequest.mock.calls[0][0].body as Record<string, unknown>;

beforeEach(() => {
  mockRequest.mockReset().mockResolvedValue({ success: true });
});

describe('createThreadAction and the knowledge scope', () => {
  it('sends nothing when the scope is the default', async () => {
    // apps/api validates with `forbidNonWhitelisted`, so a body carrying a
    // field an older api does not know answers 400 — and thread creation is
    // the core flow. Railway cannot express "deploy api before web", so the
    // client stays quiet whenever it has nothing to say.
    await createThreadAction(
      'org-1',
      'user-1',
      undefined,
      undefined,
      'm',
      [],
      'KNOWLEDGE_BASE',
    );

    expect(bodyOf()).not.toHaveProperty('knowledgeScope');
  });

  it('sends nothing when no scope was chosen', async () => {
    await createThreadAction('org-1', 'user-1');

    expect(bodyOf()).not.toHaveProperty('knowledgeScope');
  });

  it.each(['ASSISTANT', 'MODEL_ONLY'] as const)(
    'sends %s, which cannot be expressed by omission',
    async (scope) => {
      await createThreadAction(
        'org-1',
        'user-1',
        'p1',
        undefined,
        'm',
        [],
        scope,
      );

      expect(bodyOf().knowledgeScope).toBe(scope);
    },
  );

  it('refuses to create a thread with no user', async () => {
    await expect(createThreadAction('org-1', undefined)).resolves.toEqual({
      success: false,
      errorMessage: 'Cannot create thread',
    });
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
