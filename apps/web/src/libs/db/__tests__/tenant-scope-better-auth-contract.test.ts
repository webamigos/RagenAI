import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { getOrgAdapter, organization } from 'better-auth/plugins/organization';
import { beforeEach, describe, expect, it } from 'vitest';

import { isTenantScopeSatisfied } from '@ragenai/platform-contracts';

/**
 * The guard's Better Auth cases, checked against the installed library rather
 * than a copy of what it sends.
 *
 * `tenant-scope.test.ts` holds hand-written `where` shapes — `{ AND: [...] }`,
 * `{ userId: { equals } }` — that were read off the Prisma adapter's source.
 * An upgrade that changes how the adapter writes a filter would leave those
 * tests green while every request reported again, or, worse, a narrow
 * exemption that no longer matched nothing. Here the organization plugin's own
 * adapter runs on the real `prismaAdapter`, over a client that records each
 * call instead of reaching a database, and the guard reads exactly what
 * Prisma would have been given.
 */

type Call = { model: string; operation: string; args: Record<string, unknown> };

/** Prisma model name for a client delegate: `member` → `Member`. */
const modelName = (delegate: string) =>
  delegate.charAt(0).toUpperCase() + delegate.slice(1);

function recordingPrisma(calls: Call[]) {
  const delegate = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, operation: string) => async (args: unknown) => {
          calls.push({
            model: modelName(name),
            operation,
            args: (args ?? {}) as Record<string, unknown>,
          });
          return operation === 'findMany' ? [] : null;
        },
      },
    );
  return new Proxy(
    {},
    {
      get: (_target, property: string) => {
        if (property === '$transaction') {
          return async (fn: (tx: unknown) => unknown) =>
            fn(recordingPrisma(calls));
        }
        if (property.startsWith('$') || property === 'then') {
          return undefined;
        }
        return delegate(property);
      },
    },
  );
}

async function orgAdapterOver(calls: Call[]) {
  // The options apps/web gives the plugin that change its schema: teams on.
  const options = { teams: { enabled: true } };
  const auth = betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'contract-test-secret-at-least-32-characters-long',
    database: prismaAdapter(recordingPrisma(calls), {
      provider: 'postgresql',
    }),
    plugins: [organization(options)],
  });
  // `$context` is typed for the plugin's endpoints; at run time it is the
  // AuthContext the plugin's own endpoints hand to getOrgAdapter.
  const context = (await auth.$context) as unknown as Parameters<
    typeof getOrgAdapter
  >[0];
  return getOrgAdapter(context, options);
}

describe('the tenant-scope guard against Better Auth’s own queries', () => {
  let calls: Call[];

  beforeEach(() => {
    calls = [];
  });

  it('admits listOrganizations, the cross-organization read by user', async () => {
    const orgAdapter = await orgAdapterOver(calls);

    await orgAdapter.listOrganizations('user-1');

    const read = calls.find((c) => c.model === 'Member');
    expect(read?.operation).toBe('findMany');
    // No organization in it — the exemption, not the scope check, is what
    // admits it. If the adapter ever adds one, this is the line to revisit.
    expect(JSON.stringify(read?.args.where)).not.toContain('organizationId');
    expect(
      isTenantScopeSatisfied(read!.model, read!.operation, read!.args),
    ).toBe(true);
  });

  it('reads a membership checked within an organization as scoped', async () => {
    const orgAdapter = await orgAdapterOver(calls);

    await orgAdapter.checkMembership({
      userId: 'user-1',
      organizationId: 'org-1',
    });
    await orgAdapter.findMemberByOrgId({
      userId: 'user-1',
      organizationId: 'org-1',
    });

    const reads = calls.filter((c) => c.model === 'Member');
    expect(reads).toHaveLength(2);
    for (const read of reads) {
      expect(
        isTenantScopeSatisfied(read.model, read.operation, read.args),
      ).toBe(true);
    }
  });

  it('reports a membership lookup whose organization is missing', async () => {
    const orgAdapter = await orgAdapterOver(calls);

    // A caller that lost its organization id: Better Auth 1.7 still writes
    // the conjunct, as `{ organizationId: {} }` — a filter that names the
    // column and filters nothing. Before #1502 the guard took it for a scope.
    await orgAdapter.checkMembership({
      userId: 'user-1',
      organizationId: undefined as unknown as string,
    });

    const read = calls.find((c) => c.model === 'Member');
    expect(read).toBeDefined();
    expect(
      isTenantScopeSatisfied(read!.model, read!.operation, read!.args),
    ).toBe(false);
  });
});
