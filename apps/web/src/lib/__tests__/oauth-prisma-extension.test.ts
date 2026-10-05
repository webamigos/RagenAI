import { describe, expect, it, vi } from 'vitest';

vi.mock('@/generated/prisma/client', () => ({
  Prisma: { defineExtension: (extension: unknown) => extension },
}));

import { oauthScalarListsExtension } from '../oauth-prisma-extension';

type QueryInput = {
  model: string;
  operation: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => unknown;
};
const run = (
  oauthScalarListsExtension as unknown as {
    query: { $allModels: { $allOperations: (input: QueryInput) => unknown } };
  }
).query.$allModels.$allOperations;

describe('OAuth list normalization at the Prisma boundary', () => {
  it.each([
    'create',
    'createMany',
    'createManyAndReturn',
    'update',
    'updateMany',
    'updateManyAndReturn',
  ])('normalizes %s before delegating to Prisma', async (operation) => {
    const args = {
      data: { resources: null, referenceId: null, scopes: ['mcp:read'] },
    };
    const query = vi.fn().mockResolvedValue('result');
    expect(await run({ model: 'OauthConsent', operation, args, query })).toBe(
      'result',
    );
    expect(query).toHaveBeenCalledExactlyOnceWith({
      data: { referenceId: null, scopes: ['mcp:read'] },
    });
  });
  it('normalizes both branches of an upsert', () => {
    const query = vi.fn();
    run({
      model: 'OauthConsent',
      operation: 'upsert',
      args: {
        where: { id: 'consent' },
        create: { resources: null },
        update: { requestedUserInfoClaims: null },
      },
      query,
    });
    expect(query).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'consent' },
      create: {},
      update: {},
    });
  });
  it('leaves reads and unrelated writes unchanged', () => {
    for (const [model, operation] of [
      ['OauthConsent', 'findMany'],
      ['McpOAuthToken', 'update'],
    ]) {
      const args = { data: { resources: null } };
      const query = vi.fn();
      run({ model, operation, args, query });
      expect(query).toHaveBeenCalledExactlyOnceWith(args);
      expect(args.data.resources).toBeNull();
    }
  });
});
