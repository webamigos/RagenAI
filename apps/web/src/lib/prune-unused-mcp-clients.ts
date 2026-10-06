import type { DBAdapter } from 'better-auth';

export const MCP_CLIENT_RETENTION_DAYS = 30;
const PAGE_SIZE = 100;

/** The maintenance caller supplies a serializable adapter transaction, so a
 * concurrent consent cannot be lost to the client's cascading deletion. */
export async function pruneUnusedMcpClients(
  adapter: DBAdapter,
  now = new Date(),
) {
  const cutoff = new Date(
    now.getTime() - MCP_CLIENT_RETENTION_DAYS * 86_400_000,
  );
  let cursor: string | undefined;
  let deleted = 0;
  while (true) {
    const clients = await adapter.findMany<{
      id: string;
      clientId: string;
      createdAt?: Date | string | null;
      userId?: string | null;
      scopes?: string[];
    }>({
      model: 'oauthClient',
      where: [
        { field: 'createdAt', operator: 'lt', value: cutoff },
        { field: 'userId', value: null },
        ...(cursor
          ? [{ field: 'id', operator: 'gt' as const, value: cursor }]
          : []),
      ],
      sortBy: { field: 'id', direction: 'asc' },
      limit: PAGE_SIZE,
    });
    if (!clients.length) break;
    for (const client of clients) {
      // Fail closed if an adapter returns a null date or an unrelated client.
      if (
        !client.createdAt ||
        client.userId ||
        !(new Date(client.createdAt).getTime() < cutoff.getTime())
      )
        continue;
      let used = false;
      for (const model of [
        'oauthConsent',
        'oauthAccessToken',
        'oauthRefreshToken',
      ]) {
        if (
          await adapter.findOne({
            model,
            where: [{ field: 'clientId', value: client.clientId }],
          })
        ) {
          used = true;
          break;
        }
      }
      if (used) continue;
      // Registration itself creates resource bindings; they are configuration,
      // not a user's grant. Remove them atomically with the unused client.
      await adapter.deleteMany({
        model: 'oauthClientResource',
        where: [{ field: 'clientId', value: client.clientId }],
      });
      await adapter.delete({
        model: 'oauthClient',
        where: [{ field: 'id', value: client.id }],
      });
      deleted++;
    }
    cursor = clients.at(-1)!.id;
    if (clients.length < PAGE_SIZE) break;
  }
  return { deleted, olderThan: cutoff.toISOString() };
}
