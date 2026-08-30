import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockGetCurrentUser = vi.fn();
const mockGetOrgIdFromAuth = vi.fn();
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  getOrgIdFromAuth: () => mockGetOrgIdFromAuth(),
}));

const mockRagenApiRequest = vi.fn();
vi.mock('@/libs/ragen-api-client/client', () => ({
  ragenApiRequest: (...args: unknown[]) => mockRagenApiRequest(...args),
}));

import { updateMessagePlayedCommand } from '../update-message-played-command';

describe('updateMessagePlayedCommand', () => {
  beforeEach(() => {
    mockGetCurrentUser.mockReset();
    mockGetOrgIdFromAuth.mockReset();
    mockRagenApiRequest.mockReset();
  });

  it('calls apps/api with the message id, userId, and orgId', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockGetOrgIdFromAuth.mockResolvedValue('org-1');
    mockRagenApiRequest.mockResolvedValue({ id: 'msg-1', voicePlayed: true });

    const result = await updateMessagePlayedCommand('msg-1');

    expect(mockRagenApiRequest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/v1/internal/messages/msg-1/played',
      userId: 'user-1',
      orgId: 'org-1',
    });
    expect(result).toEqual({ id: 'msg-1', voicePlayed: true });
  });

  it('URL-encodes the message id', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockGetOrgIdFromAuth.mockResolvedValue('org-1');
    mockRagenApiRequest.mockResolvedValue({});

    await updateMessagePlayedCommand('msg/with slash');

    expect(mockRagenApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/v1/internal/messages/msg%2Fwith%20slash/played',
      }),
    );
  });

  it('throws without calling apps/api when there is no org context', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockGetOrgIdFromAuth.mockResolvedValue(null);

    await expect(updateMessagePlayedCommand('msg-1')).rejects.toThrow(
      'Unauthorized: organization context required',
    );
    expect(mockRagenApiRequest).not.toHaveBeenCalled();
  });

  it('throws without calling apps/api when there is no authenticated user', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    mockGetOrgIdFromAuth.mockResolvedValue('org-1');

    await expect(updateMessagePlayedCommand('msg-1')).rejects.toThrow(
      'Unauthorized: organization context required',
    );
    expect(mockRagenApiRequest).not.toHaveBeenCalled();
  });

  it('propagates errors from apps/api', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockGetOrgIdFromAuth.mockResolvedValue('org-1');
    mockRagenApiRequest.mockRejectedValue(new Error('Message not found'));

    await expect(updateMessagePlayedCommand('msg-1')).rejects.toThrow(
      'Message not found',
    );
  });
});
