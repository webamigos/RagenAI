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
 * that is where grants live. It also carries its **own** `ownerId`, and that
 * is the part that matters here: `user_documents.file_id` is ON DELETE SET
 * NULL, so the file this predicate defers to can disappear underneath it.
 *
 * This used to answer `true` for a document with no file — "no ownership
 * signal, therefore org-wide", the same allowance unowned files get. The
 * allowance is right for a document nobody ever owned. It is wrong for one
 * whose owner was deleted along with the file, and the difference is invisible
 * from `fileId` alone: **deleting a private file published that document's
 * decrypted content and its whole version history to every member of the
 * organization.** Not theoretical — it flipped three of `p0-26`'s
 * access-control assertions from 404 to 200 when an unrelated delete test
 * happened to pick the private fixture, and read as a regression in a spec
 * nobody had touched.
 *
 * Three routes reach that state, which is why fixing the delete path alone
 * would not have been enough: `bindFileWithDocument` never running (a failed
 * ingest), a Drive re-sync clearing `UserFile.documentId`, and the cleanup in
 * `delete-file-command` being a `try`/`catch` that warns and continues. The
 * predicate is the one place all three arrive at.
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
    select: { fileId: true, ownerId: true },
  });
  if (!doc) {
    return false;
  }

  if (doc.fileId) {
    return canAccessFile(doc.fileId, organizationId, actor);
  }

  // No file: fall back to the document's own standing, mirroring
  // `fileAccessWhere` rather than inventing a second set of rules.
  if (actor.scope === 'organization') {
    return true;
  }
  if (actor.scope === 'none') {
    return false;
  }
  // A document nobody owns predates ownership and stays org-wide, exactly as
  // an unowned file does. One that has an owner answers only to them.
  return doc.ownerId === null || doc.ownerId === actor.userId;
}
