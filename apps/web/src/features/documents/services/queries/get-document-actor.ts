// `server-only`, not `'use server'`. The directive would publish every export
// here as a callable Server Action, and `canAccessFile`/`canAccessDocument`
// take the actor as an *argument* — a client could post `scope: 'organization'`
// with any org id and use the answer as a cross-org existence oracle. These
// are server-internal helpers; the same pattern as require-project-access.ts.
import 'server-only';

import db from '@ragenai/prisma-client';
import { getCurrentUserId } from '@/app/lib/utils/auth-helpers';
import { getActiveMember, getUserTeamIds } from '@/lib/auth-guards';
import { orgVisibilityScope } from '@/lib/auth-access-control';
import { fileAccessWhere, type DocumentActor } from './document-access';

/**
 * Resolves the actor from the session, the same way the listing page does.
 *
 * Separate from `document-access.ts` so that the predicate itself stays
 * importable from anywhere. This module reaches the session and the database,
 * so it belongs only to server paths.
 */
export async function getDocumentActor(
  organizationId: string,
): Promise<DocumentActor> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { userId: null, teamIds: [], scope: 'none' };
  }

  const [teamIds, member] = await Promise.all([
    getUserTeamIds(organizationId, userId),
    getActiveMember(organizationId).catch(() => null),
  ]);

  return {
    userId,
    teamIds,
    // A non-member gets `'none'`, not the member scope, even if a stale
    // session names this org — getActiveMember found no row for them here, so
    // `member?.role` is undefined and `orgVisibilityScope` reads that as "no
    // membership".
    scope: orgVisibilityScope(member?.role),
  };
}

/** Whether the actor may read this file at all. */
export async function canAccessFile(
  fileId: string,
  organizationId: string,
  actor: DocumentActor,
): Promise<boolean> {
  if (!actor.userId) {
    return false;
  }
  const file = await db.userFile.findFirst({
    where: { id: fileId, organizationId, ...fileAccessWhere(actor) },
    select: { id: true },
  });
  return file !== null;
}

/**
 * Whether the actor may read this document.
 *
 * A document inherits its standing from the file it was ingested from, since
 * that is where ownership and grants live. A document with no file has no
 * ownership signal at all, so it stays org-wide — the same treatment unowned
 * files get, and for the same backwards-compatibility reason.
 */
export async function canAccessDocument(
  documentId: string,
  organizationId: string,
  actor: DocumentActor,
): Promise<boolean> {
  if (!actor.userId) {
    return false;
  }

  const doc = await db.userDocument.findFirst({
    where: { id: documentId, organizationId },
    select: { fileId: true },
  });
  if (!doc) {
    return false;
  }
  if (!doc.fileId) {
    return true;
  }

  return canAccessFile(doc.fileId, organizationId, actor);
}
