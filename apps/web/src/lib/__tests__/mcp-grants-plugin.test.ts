import type { DBAdapter } from 'better-auth';
import { describe, expect, it, vi } from 'vitest';
import { disconnectMcpGrant } from '../mcp-grants-plugin';

function adapter(consent: unknown) {
  const transaction = {
    findOne: vi.fn().mockResolvedValue(consent),
    deleteMany: vi.fn().mockResolvedValue(1),
  };
  const database = {
    transaction: vi.fn(async (callback) => callback(transaction)),
  } as unknown as DBAdapter;
  return { database, transaction };
}
describe('MCP Disconnect', () => {
  it('deletes access tokens, refresh tokens and consent for only the current user/client', async () => {
    const { database, transaction } = adapter({
      id: 'grant',
      userId: 'user',
      clientId: 'client',
      scopes: ['mcp:read'],
    });
    await disconnectMcpGrant(database, 'user', 'grant');
    expect(transaction.findOne).toHaveBeenCalledWith({
      model: 'oauthConsent',
      where: [
        { field: 'id', value: 'grant' },
        { field: 'userId', value: 'user' },
      ],
    });
    expect(
      transaction.deleteMany.mock.calls.map(([query]) => query.model),
    ).toEqual(['oauthAccessToken', 'oauthRefreshToken', 'oauthConsent']);
    for (const [query] of transaction.deleteMany.mock.calls)
      expect(query.where).toEqual([
        { field: 'userId', value: 'user' },
        { field: 'clientId', value: 'client' },
      ]);
  });
  it.each([null, { scopes: ['openid'] }])(
    'does not mutate a missing, foreign or non-MCP grant',
    async (consent) => {
      const { database, transaction } = adapter(consent);
      await expect(
        disconnectMcpGrant(database, 'user', 'grant'),
      ).rejects.toMatchObject({ status: 'NOT_FOUND' });
      expect(transaction.deleteMany).not.toHaveBeenCalled();
    },
  );
});
