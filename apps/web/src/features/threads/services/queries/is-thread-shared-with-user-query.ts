import 'server-only';

import db from '@ragenai/prisma-client';

/**
 * Whether `userId` holds a share of `threadId` — a `ThreadShare` row, which
 * the owner creates from the share dialog and which lists the thread under
 * "Shared with me".
 *
 * It names a reader, nothing more. Callers have already found the thread
 * inside the session's organization, so a share cannot widen access across
 * organizations; and a shared reader reads, read-only, as an org admin does —
 * writing to someone else's thread stays the owner's.
 */
export async function isThreadSharedWithUserQuery(
  threadId: string,
  userId: string,
): Promise<boolean> {
  const share = await db.threadShare.findUnique({
    where: { threadId_userId: { threadId, userId } },
    select: { id: true },
  });
  return share !== null;
}
