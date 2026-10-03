import 'server-only';

import { z } from 'zod';
import db from '@ragenai/prisma-client';

import { getEffectiveProjectPermissionQuery } from '@/features/projects/services/queries/get-effective-project-permission-query';

export type ThreadProjectContextChange =
  | { status: 'ok'; mentionedProjectId: string | null }
  | { status: 'thread-not-found' }
  | { status: 'project-not-found' };

/**
 * A Postgres `uuid`: any 8-4-4-4-12 hex id, which is what the columns hold.
 * Not `z.uuid()`, which also demands an RFC 4122 version and variant: ids
 * Prisma generates pass it, but a row seeded or imported with a fixed id
 * (the e2e seed's `e2e00000-…`) is a valid thread the strict form refuses.
 */
const uuid = z.guid();

/**
 * Point a thread at a project (or at none), the one way to change a thread's
 * project context.
 *
 * - **The thread is the caller's own.** Its context decides which
 *   instructions its next answer runs under, so it is the owner's to set: a
 *   member it was shared with, or an admin reading it, reads it read-only.
 *   The ownership test is the `model` route's.
 * - **The project is one the caller can see** — `getEffectiveProjectPermission`,
 *   the rule the projects pages use. Being in the same organization is not
 *   the same as being allowed to read a project's instructions.
 * - **The write repeats the thread's scope,** so it cannot land on a row the
 *   check did not see.
 *
 * Not a Server Action: it takes the organization and user from its caller,
 * which must have read them from the session.
 */
export async function setThreadProjectContext({
  threadId,
  organizationId,
  userId,
  mentionedProjectId,
}: {
  threadId: string;
  organizationId: string;
  userId: string;
  mentionedProjectId: string | null;
}): Promise<ThreadProjectContextChange> {
  if (!uuid.safeParse(threadId).success) {
    return { status: 'thread-not-found' };
  }
  const owned = {
    id: threadId,
    organizationId,
    OR: [{ userId }, { visitorId: userId }],
  };

  const thread = await db.thread.findFirst({
    where: owned,
    select: { id: true },
  });
  if (!thread) {
    return { status: 'thread-not-found' };
  }

  if (mentionedProjectId !== null) {
    if (!uuid.safeParse(mentionedProjectId).success) {
      return { status: 'project-not-found' };
    }
    const permission = await getEffectiveProjectPermissionQuery(
      mentionedProjectId,
      organizationId,
      userId,
    );
    if (!permission.canView) {
      return { status: 'project-not-found' };
    }
  }

  const { count } = await db.thread.updateMany({
    where: owned,
    data: { mentionedProjectId },
  });
  if (count === 0) {
    return { status: 'thread-not-found' };
  }
  return { status: 'ok', mentionedProjectId };
}
