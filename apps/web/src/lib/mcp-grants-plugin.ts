import type { DBAdapter, BetterAuthPlugin } from 'better-auth';
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  sessionMiddleware,
} from 'better-auth/api';
import { z } from 'zod';

/** All storage mutations remain inside a Better Auth plugin API/adapter. */
export async function disconnectMcpGrant(
  adapter: DBAdapter,
  userId: string,
  consentId: string,
): Promise<void> {
  await adapter.transaction(async (transaction) => {
    const consent = await transaction.findOne<{
      id: string;
      userId: string;
      clientId: string;
      scopes: string[];
    }>({
      model: 'oauthConsent',
      where: [
        { field: 'id', value: consentId },
        { field: 'userId', value: userId },
      ],
    });
    if (!consent || !consent.scopes.includes('mcp:read')) {
      throw new APIError('NOT_FOUND', { message: 'MCP connection not found' });
    }
    // One row per client: disconnect every grant for this user/client,
    // including a previous workspace selection and rotated refresh tokens.
    const where = [
      { field: 'userId', value: userId },
      { field: 'clientId', value: consent.clientId },
    ];
    await transaction.deleteMany({ model: 'oauthAccessToken', where });
    await transaction.deleteMany({ model: 'oauthRefreshToken', where });
    await transaction.deleteMany({ model: 'oauthConsent', where });
  });
}

export async function revokeMcpGrants(
  adapter: DBAdapter,
  scope: { userId?: string; organizationId?: string },
): Promise<void> {
  if (!scope.userId && !scope.organizationId)
    throw new Error('Grant revocation requires a scope');
  const where = [
    ...(scope.userId ? [{ field: 'userId', value: scope.userId }] : []),
    ...(scope.organizationId
      ? [
          {
            field: 'referenceId',
            operator: 'starts_with' as const,
            value: `${scope.organizationId}:`,
          },
        ]
      : []),
  ];
  await adapter.transaction(async (transaction) => {
    for (const model of [
      'oauthAccessToken',
      'oauthRefreshToken',
      'oauthConsent',
    ]) {
      await transaction.deleteMany({ model, where });
    }
  });
}

export function removedMcpGrantScope(
  path: string,
  returned: unknown,
): { userId?: string; organizationId: string } | undefined {
  const member = z.object({
    userId: z.string().min(1),
    organizationId: z.string().min(1),
  });
  if (path === '/organization/remove-member') {
    const result = z.object({ member }).safeParse(returned);
    return result.success
      ? {
          userId: result.data.member.userId,
          organizationId: result.data.member.organizationId,
        }
      : undefined;
  }
  if (path === '/organization/leave') {
    const result = member.safeParse(returned);
    return result.success ? result.data : undefined;
  }
  if (path === '/organization/delete') {
    const result = z.object({ id: z.string().min(1) }).safeParse(returned);
    return result.success ? { organizationId: result.data.id } : undefined;
  }
  return undefined;
}

/** The provider's delete-consent endpoint alone does not revoke tokens. */
export function mcpGrantsPlugin() {
  return {
    id: 'mcp-grants' as const,
    hooks: {
      after: [
        {
          matcher: (ctx: { path?: string }) =>
            [
              '/organization/remove-member',
              '/organization/leave',
              '/organization/delete',
            ].includes(ctx.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const scope = removedMcpGrantScope(
              ctx.path ?? '',
              ctx.context.returned,
            );
            if (scope) await revokeMcpGrants(ctx.context.adapter, scope);
          }),
        },
      ],
    },
    endpoints: {
      listMcpApps: createAuthEndpoint(
        '/mcp/apps',
        {
          method: 'GET',
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const consents = await ctx.context.adapter.findMany<{
            id: string;
            clientId: string;
            referenceId?: string;
            scopes: string[];
            createdAt: Date;
          }>({
            model: 'oauthConsent',
            where: [{ field: 'userId', value: ctx.context.session.user.id }],
          });
          const clients = new Set<string>();
          const apps = [];
          for (const consent of consents.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )) {
            if (
              !consent.scopes.includes('mcp:read') ||
              clients.has(consent.clientId)
            )
              continue;
            clients.add(consent.clientId);
            const client = await ctx.context.adapter.findOne<{ name?: string }>(
              {
                model: 'oauthClient',
                where: [{ field: 'clientId', value: consent.clientId }],
              },
            );
            const { getMcpConnectionLabels, getMcpConnectionLastUse } =
              await import('@/features/organizations/services/queries/get-mcp-connection-labels-query');
            const labels = await getMcpConnectionLabels(
              ctx.context.session.user.id,
              consent.referenceId,
            );
            apps.push({
              ...labels,
              lastUsedAt: await getMcpConnectionLastUse(
                ctx.context.session.user.id,
                consent.clientId,
              ),
              consentId: consent.id,
              clientId: consent.clientId,
              name: client?.name ?? consent.clientId,
              referenceId: consent.referenceId ?? null,
              connectedAt: consent.createdAt,
            });
          }
          return ctx.json(apps);
        },
      ),
      disconnectMcpApp: createAuthEndpoint(
        '/mcp/disconnect',
        {
          method: 'POST',
          use: [sessionMiddleware],
          body: z.object({ consentId: z.string().min(1).max(2048) }),
        },
        async (ctx) => {
          await disconnectMcpGrant(
            ctx.context.adapter,
            ctx.context.session.user.id,
            ctx.body.consentId,
          );
          return ctx.json({ success: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
