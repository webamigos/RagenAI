import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getSessionOrThrow } from '@/lib/auth-guards';
import { verifiedMcpQuery } from '@/lib/mcp-connect-flow';
import { getMcpWorkspaceOptions } from '@/features/organizations/services/queries/mcp-grant-context-query';
import { WorkspaceForm } from '../WorkspaceForm';

export const dynamic = 'force-dynamic';
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.MCP_OAUTH_ENABLED !== 'true') {
    notFound();
  }
  const params = await searchParams;
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      value === undefined
        ? []
        : (Array.isArray(value) ? value : [value]).map((item) => [key, item]),
    ),
  ).toString();
  const { clientId, redirectHost } = await verifiedMcpQuery(query);
  const session = await getSessionOrThrow();
  const client = await auth.api.getOAuthClientPublic({
    headers: await headers(),
    query: { client_id: clientId },
  });
  const organizations = await getMcpWorkspaceOptions(session.user.id);
  return (
    <section className="w-full max-w-lg space-y-5 rounded border bg-background p-6">
      <h1 className="text-xl font-semibold">
        Connect {client.client_name ?? 'an app'} to Ragen
      </h1>
      <p className="text-lg font-semibold">{redirectHost}</p>
      <p>Choose the organization and assistants this app may use.</p>
      {organizations.length ? (
        <WorkspaceForm organizations={organizations} query={query} />
      ) : (
        <p>No organization has MCP OAuth enabled for your account.</p>
      )}
    </section>
  );
}
