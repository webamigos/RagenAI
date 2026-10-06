import type { DBAdapter } from 'better-auth';
import { describe, expect, it, vi } from 'vitest';
import { pruneUnusedMcpClients } from '../prune-unused-mcp-clients';

const now = new Date('2026-10-06T00:00:00Z');
const old = {
  id: 'old',
  clientId: 'client',
  userId: null,
  createdAt: new Date('2026-09-05T00:00:00Z'),
  scopes: ['mcp:read'],
};
function fixture(clients = [old], usedModel?: string) {
  const adapter = {
    findMany: vi.fn().mockResolvedValue(clients),
    findOne: vi.fn(async ({ model }) =>
      model === usedModel ? { id: 'used' } : null,
    ),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return { adapter, db: adapter as unknown as DBAdapter };
}
describe('unused MCP client retention', () => {
  it('removes only an old anonymous MCP client without any grants or resource configuration', async () => {
    const { adapter, db } = fixture();
    expect(await pruneUnusedMcpClients(db, now)).toEqual({
      deleted: 1,
      olderThan: '2026-09-06T00:00:00.000Z',
    });
    expect(adapter.delete).toHaveBeenCalledWith({
      model: 'oauthClient',
      where: [{ field: 'id', value: 'old' }],
    });
    expect(adapter.findMany.mock.calls[0][0].where).toContainEqual({
      field: 'createdAt',
      operator: 'lt',
      value: new Date('2026-09-06T00:00:00Z'),
    });
  });
  it.each([
    'oauthConsent',
    'oauthAccessToken',
    'oauthRefreshToken',
    'oauthClientResource',
  ])('preserves a client used by %s', async (model) => {
    const { adapter, db } = fixture([old], model);
    expect((await pruneUnusedMcpClients(db, now)).deleted).toBe(0);
    expect(adapter.delete).not.toHaveBeenCalled();
  });
  it.each([
    { ...old, createdAt: new Date('2026-09-06T00:00:00Z') },
    { ...old, createdAt: new Date('2026-10-05T00:00:00Z') },
    { ...old, createdAt: null },
    { ...old, createdAt: 'invalid' },
    { ...old, userId: 'owner' },
  ])(
    'preserves a recent, owned or unidentifiable client: %j',
    async (client) => {
      const { adapter, db } = fixture([client] as (typeof old)[]);
      expect((await pruneUnusedMcpClients(db, now)).deleted).toBe(0);
      expect(adapter.delete).not.toHaveBeenCalled();
    },
  );
  it('uses an id cursor so deleting one page cannot skip the next page', async () => {
    const { adapter, db } = fixture();
    adapter.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, i) => ({
          ...old,
          id: String(i).padStart(3, '0'),
        })),
      )
      .mockResolvedValueOnce([{ ...old, id: '100' }]);
    expect((await pruneUnusedMcpClients(db, now)).deleted).toBe(101);
    expect(adapter.findMany.mock.calls[1][0].where).toContainEqual({
      field: 'id',
      operator: 'gt',
      value: '099',
    });
  });
});
