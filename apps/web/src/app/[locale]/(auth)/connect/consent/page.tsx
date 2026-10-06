import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import db from '@ragenai/prisma-client';
import { auth } from '@/lib/auth';
import { getSessionOrThrow } from '@/lib/auth-guards';
import { verifiedMcpQuery } from '@/lib/mcp-connect-flow';
import { getMcpSelection } from '@/features/organizations/services/commands/mcp-selection-command';
import { consentToMcp } from '../actions';

export const dynamic = 'force-dynamic';
export default async function ConsentPage({
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
  const {
    clientId,
    redirectHost,
    params: authorization,
  } = await verifiedMcpQuery(query);
  const session = await getSessionOrThrow();
  const selection = await getMcpSelection(
    { sessionId: session.session.id, userId: session.user.id },
    clientId,
  );
  const [client, organization, project] = await Promise.all([
    auth.api.getOAuthClientPublic({
      headers: await headers(),
      query: { client_id: clientId },
    }),
    db.organization.findUniqueOrThrow({
      where: { id: selection.organizationId },
      select: { name: true },
    }),
    selection.projectId
      ? db.project.findFirst({
          where: {
            id: selection.projectId,
            organizationId: selection.organizationId,
          },
          select: { title: true },
        })
      : null,
  ]);
  return (
    <section className="w-full max-w-lg space-y-5 rounded border bg-background p-6">
      <h1 className="text-xl font-semibold">
        Allow {client.client_name ?? 'this app'} to access Ragen?
      </h1>
      <p className="text-xl font-semibold">{redirectHost}</p>
      <p>Organization: {organization.name}</p>
      <p>Assistant: {project?.title ?? 'All assistants you can access'}</p>
      <p>
        The app can ask questions, search your knowledge base and list
        assistants within your permissions.
      </p>
      <p>Requested scopes: {authorization.get('scope')}</p>
      <form action={consentToMcp.bind(null, query)} className="flex gap-3">
        <button
          name="decision"
          value="accept"
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
        >
          Allow access
        </button>
        <button
          name="decision"
          value="deny"
          className="rounded border px-4 py-2"
        >
          Cancel
        </button>
      </form>
    </section>
  );
}
