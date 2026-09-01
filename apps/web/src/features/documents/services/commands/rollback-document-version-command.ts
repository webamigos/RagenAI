import db from '@ragenai/prisma-client';
import type { DocumentVersion } from '@/generated/prisma/client';
import { createDocumentVersionCommand } from './create-document-version-command';
import type { RagScore } from '@/features/documents/contracts/rag-score.types';

type RollbackInput = {
  documentId: string;
  versionId: string;
  authorId: string;
  orgId: string;
};

/**
 * Restore an earlier version by appending it as a new one — history is never
 * rewritten, so a rollback can itself be rolled back.
 */
export async function rollbackDocumentVersionCommand(
  input: RollbackInput,
): Promise<DocumentVersion> {
  const { documentId, versionId, authorId, orgId } = input;

  // Establish tenancy from the document first. documentId arrives from the URL,
  // and without this an org could roll back a document belonging to another one:
  // the version lookup keyed on (id, documentId) alone would match, and the new
  // version would be appended to the other tenant's history with every one of
  // their existing versions deactivated.
  const document = await db.userDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
    select: { id: true },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  const target = await db.documentVersion.findFirst({
    where: { id: versionId, documentId, organizationId: orgId },
    select: {
      id: true,
      versionNumber: true,
      content: true,
      title: true,
      metadata: true,
      ragScore: true,
    },
  });

  if (!target) {
    throw new Error('Version not found');
  }

  const newVersion = await createDocumentVersionCommand({
    documentId,
    organizationId: orgId,
    content: target.content,
    title: target.title,
    changeType: 'ROLLBACK',
    authorId,
    // Carried over: the content is identical, so the score it earned still
    // describes it. Re-embedding does not change that.
    ragScore: target.ragScore as RagScore | null,
    metadata: target.metadata as Record<string, unknown> | null,
    // The number, not the uuid — this string is shown to people.
    comment: `Rollback to version ${target.versionNumber}`,
  });

  await db.userDocument.updateMany({
    where: { id: documentId, organizationId: orgId },
    data: {
      content: target.content,
      title: target.title,
      updatedAt: new Date(),
    },
  });

  return newVersion;
}
