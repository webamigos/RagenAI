import { beforeEach, describe, expect, it, vi } from 'vitest';

const ragenApiRequest = vi.hoisted(() => vi.fn());
const getOrgIdFromAuthOrThrow = vi.hoisted(() => vi.fn());
const getCurrentUserId = vi.hoisted(() => vi.fn());

vi.mock('@/libs/ragen-api-client/client', () => ({ ragenApiRequest }));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
}));

import {
  getAnswerFromDocumentsOnlyAction,
  saveAnswerFromDocumentsOnlyAction,
} from '../actions';

/**
 * The organization and user come from the session: they are what apps/api's
 * signed token carries, and apps/api checks the project against them
 * (`canView` to read, `manage` to save). Nothing a caller passes can name
 * another organization.
 */
describe('the answer-from-documents-only actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrgIdFromAuthOrThrow.mockResolvedValue('org-from-session');
    getCurrentUserId.mockResolvedValue('user-1');
    ragenApiRequest.mockResolvedValue({ success: true });
  });

  it('saves through apps/api as the session organization and user', async () => {
    await expect(
      saveAnswerFromDocumentsOnlyAction('proj-1', false),
    ).resolves.toEqual({ success: true });

    expect(ragenApiRequest).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/v1/internal/projects/proj-1/answer-from-documents-only',
      userId: 'user-1',
      orgId: 'org-from-session',
      body: { answerFromDocumentsOnly: false },
    });
  });

  it('reads through apps/api as the session organization and user', async () => {
    const state = {
      setting: null,
      chatbotEnabled: true,
      effective: true,
      canManage: true,
    };
    ragenApiRequest.mockResolvedValue(state);

    await expect(getAnswerFromDocumentsOnlyAction('proj-1')).resolves.toEqual(
      state,
    );
    expect(ragenApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        orgId: 'org-from-session',
        userId: 'user-1',
      }),
    );
  });

  it('encodes the project id into the path', async () => {
    await saveAnswerFromDocumentsOnlyAction('../other', true);

    expect(ragenApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/v1/internal/projects/..%2Fother/answer-from-documents-only',
      }),
    );
  });

  it('refuses without a session, and calls nothing', async () => {
    getOrgIdFromAuthOrThrow.mockRejectedValue(new Error('Unauthorized'));

    await expect(
      saveAnswerFromDocumentsOnlyAction('proj-1', true),
    ).resolves.toEqual({ success: false });
    await expect(getAnswerFromDocumentsOnlyAction('proj-1')).resolves.toBe(
      null,
    );
    expect(ragenApiRequest).not.toHaveBeenCalled();
  });

  it('refuses without a user, and calls nothing', async () => {
    getCurrentUserId.mockResolvedValue(null);

    await expect(
      saveAnswerFromDocumentsOnlyAction('proj-1', true),
    ).resolves.toEqual({ success: false });
    expect(ragenApiRequest).not.toHaveBeenCalled();
  });

  it('refuses a value that is not a boolean', async () => {
    await expect(
      saveAnswerFromDocumentsOnlyAction('proj-1', 'yes' as never),
    ).resolves.toEqual({ success: false });
    expect(ragenApiRequest).not.toHaveBeenCalled();
  });

  it('reports a refusal from apps/api (no manage access) as a failure', async () => {
    ragenApiRequest.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { status: 401 }),
    );

    await expect(
      saveAnswerFromDocumentsOnlyAction('proj-1', true),
    ).resolves.toEqual({ success: false });
  });
});
