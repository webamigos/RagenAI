import 'server-only';

import db from '@ragenai/prisma-client';

import type { MemoryGateThread } from '../../utils/memory-extraction-gate';

/**
 * What the memory gate needs to know about a thread: whether it is panel
 * chat, who owns it, and whether anyone else can open it. Read under the
 * organization. Shared by the write (enqueue) and the read (the turn's
 * memory block), so the two cannot disagree on which threads memory may
 * touch. Null when the thread is not in this organization.
 */
export async function getMemoryGateThreadQuery(
  threadId: string,
  organizationId: string,
): Promise<MemoryGateThread | null> {
  const thread = await db.thread.findFirst({
    where: { id: threadId, organizationId },
    select: {
      kind: true,
      source: true,
      chatbotId: true,
      visitorId: true,
      teamId: true,
      publicLink: { select: { id: true } },
      _count: { select: { shares: true } },
    },
  });
  if (!thread) {
    return null;
  }
  return {
    kind: thread.kind,
    source: thread.source,
    chatbotId: thread.chatbotId,
    visitorId: thread.visitorId,
    teamId: thread.teamId,
    shareCount: thread._count.shares,
    hasPublicLink: thread.publicLink !== null,
  };
}
