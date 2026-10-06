import db from '@ragenai/prisma-client';
import { APIError } from 'better-auth/api';
import { assertMcpGrantContext } from '../queries/mcp-grant-context-query';

const MAX_SELECTION_AGE_MS = 10 * 60 * 1000;
export async function saveMcpSelection(
  actor: { sessionId: string; userId: string },
  clientId: string,
  organizationId: string,
  projectId?: string,
) {
  await assertMcpGrantContext(actor.userId, organizationId, projectId);
  return db.mcpConnectSelection.upsert({
    where: { sessionId_clientId: { sessionId: actor.sessionId, clientId } },
    create: {
      sessionId: actor.sessionId,
      userId: actor.userId,
      clientId,
      organizationId,
      projectId,
    },
    update: {
      userId: actor.userId,
      organizationId,
      projectId: projectId ?? null,
      createdAt: new Date(),
    },
  });
}
export async function getMcpSelection(
  actor: { sessionId: string; userId: string },
  clientId: string,
) {
  const selection = await db.mcpConnectSelection.findUnique({
    where: { sessionId_clientId: { sessionId: actor.sessionId, clientId } },
  });
  if (
    !selection ||
    selection.userId !== actor.userId ||
    Date.now() - selection.createdAt.getTime() > MAX_SELECTION_AGE_MS
  ) {
    throw new APIError('FORBIDDEN', {
      message: 'Choose an organization again',
    });
  }
  await assertMcpGrantContext(
    actor.userId,
    selection.organizationId,
    selection.projectId ?? undefined,
  );
  return selection;
}
export function mcpReferenceId(
  organizationId: string,
  projectId?: string | null,
) {
  return `${organizationId}:${projectId ?? 'all'}`;
}
export async function mcpClaims(
  userId: string | undefined,
  referenceId: string | undefined,
) {
  const parts = referenceId?.split(':');
  if (!userId || !parts || parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new APIError('FORBIDDEN', {
      message: 'MCP workspace selection is required',
    });
  }
  const [organizationId, project] = parts;
  const projectId = project === 'all' ? undefined : project;
  await assertMcpGrantContext(userId, organizationId, projectId);
  return { org: organizationId, ...(projectId ? { project: projectId } : {}) };
}
