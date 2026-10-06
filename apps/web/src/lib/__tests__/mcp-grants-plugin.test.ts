import type { DBAdapter } from 'better-auth';
import { describe, expect, it, vi } from 'vitest';
import {
  disconnectMcpGrant,
  revokeMcpGrants,
  replaceMcpGrant,
  removedMcpGrantScope,
} from '../mcp-grants-plugin';

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

it('revokes only grants within the affected user and exact organization namespace', async () => {
  const { database, transaction } = adapter(null);
  await revokeMcpGrants(database, { userId: 'user', organizationId: 'org' });
  expect(transaction.deleteMany).toHaveBeenCalledTimes(3);
  for (const [query] of transaction.deleteMany.mock.calls)
    expect(query.where).toEqual([
      { field: 'userId', value: 'user' },
      { field: 'referenceId', operator: 'starts_with', value: 'org:' },
    ]);
});
it('cannot revoke an unscoped set of grants', async () => {
  const { database, transaction } = adapter(null);
  await expect(revokeMcpGrants(database, {})).rejects.toThrow(
    'requires a scope',
  );
  expect(transaction.deleteMany).not.toHaveBeenCalled();
});
it('derives revocation scope from successful server results, not caller bodies', () => {
  expect(
    removedMcpGrantScope('/organization/remove-member', {
      member: { userId: 'user', organizationId: 'org' },
    }),
  ).toEqual({ userId: 'user', organizationId: 'org' });
  expect(
    removedMcpGrantScope('/organization/leave', {
      userId: 'user',
      organizationId: 'org',
    }),
  ).toEqual({ userId: 'user', organizationId: 'org' });
  expect(removedMcpGrantScope('/organization/delete', { id: 'org' })).toEqual({
    organizationId: 'org',
  });
  expect(
    removedMcpGrantScope('/organization/remove-member', { error: 'Forbidden' }),
  ).toBeUndefined();
});

it('replaces only other workspace grants after the new MCP consent exists', async () => {
  const { database, transaction } = adapter({ scopes: ['mcp:read'] });
  await replaceMcpGrant(database, 'user', 'client', 'new-org:all');
  expect(transaction.deleteMany).toHaveBeenCalledTimes(3);
  for (const [query] of transaction.deleteMany.mock.calls)
    expect(query.where).toEqual([
      { field: 'userId', value: 'user' },
      { field: 'clientId', value: 'client' },
      { field: 'referenceId', operator: 'ne', value: 'new-org:all' },
    ]);
});
it('preserves the previous grant until new consent is accepted', async () => {
  const { database, transaction } = adapter(null);
  await expect(
    replaceMcpGrant(database, 'user', 'client', 'new-org:all'),
  ).rejects.toMatchObject({ status: 'FORBIDDEN' });
  expect(transaction.deleteMany).not.toHaveBeenCalled();
});

it('revokes grants for a successful web-admin ban but ignores unsuccessful ban results', () => {
  expect(
    removedMcpGrantScope('/admin/ban-user', {
      user: { id: 'user', banned: true },
    }),
  ).toEqual({ userId: 'user' });
  expect(
    removedMcpGrantScope('/admin/ban-user', {
      user: { id: 'user', banned: false },
    }),
  ).toBeUndefined();
});
