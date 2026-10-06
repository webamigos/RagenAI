import db from '@ragenai/prisma-client';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { mcpOAuthPlugins } from './mcp-oauth-config';
import { pruneUnusedMcpClients } from './prune-unused-mcp-clients';

/** Serializable isolation protects a concurrent first consent from cascade
 * deletion. Retry PostgreSQL serialization conflicts, never partial results. */
export async function runMcpClientMaintenance(now = new Date()) {
  if (process.env.MCP_OAUTH_ENABLED !== 'true')
    return { disabled: true, deleted: 0 };
  const options = { plugins: [...mcpOAuthPlugins()] };
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(
        async (transaction) => {
          const adapter = prismaAdapter(transaction, {
            provider: 'postgresql',
            transaction: false,
          })(options);
          return pruneUnusedMcpClients(adapter, now);
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (
        attempt >= 2 ||
        !error ||
        typeof error !== 'object' ||
        !('code' in error) ||
        error.code !== 'P2034'
      )
        throw error;
    }
  }
}
