'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getSessionOrThrow } from '@/lib/auth-guards';
import { verifiedMcpQuery } from '@/lib/mcp-connect-flow';
import {
  saveMcpSelection,
  getMcpSelection,
} from '@/features/organizations/services/commands/mcp-selection-command';

async function continueFlow(query: string, body: Record<string, unknown>) {
  const requestHeaders = new Headers(await headers());
  requestHeaders.set('content-type', 'application/json');
  requestHeaders.set('accept', 'application/json');
  const context = await auth.$context;
  const endpoint = body.postLogin ? 'continue' : 'consent';
  const response = await auth.handler(
    new Request(`${context.baseURL}/oauth2/${endpoint}`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ ...body, oauth_query: query }),
    }),
  );
  if (!response.ok) {
    throw new Error('Connection could not be continued');
  }
  const result = (await response.json()) as { url?: string };
  if (!result.url) {
    throw new Error('Connection did not return a redirect');
  }
  redirect(result.url);
}
export async function chooseMcpWorkspace(query: string, form: FormData) {
  const session = await getSessionOrThrow();
  const { clientId } = await verifiedMcpQuery(query);
  const organizationId = String(form.get('organizationId') ?? '');
  const projectId = String(form.get('projectId') ?? '') || undefined;
  await saveMcpSelection(
    { sessionId: session.session.id, userId: session.user.id },
    clientId,
    organizationId,
    projectId,
  );
  await continueFlow(query, { postLogin: true });
}
export async function consentToMcp(query: string, form: FormData) {
  const session = await getSessionOrThrow();
  const { clientId } = await verifiedMcpQuery(query);
  const accept = form.get('decision') === 'accept';
  if (accept) {
    await getMcpSelection(
      { sessionId: session.session.id, userId: session.user.id },
      clientId,
    );
  }
  await continueFlow(query, { accept });
}
