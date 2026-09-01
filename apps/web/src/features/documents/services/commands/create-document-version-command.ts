import db from '@ragenai/prisma-client';
import type {
  ChangeType,
  DocumentVersion,
  Prisma,
} from '@/generated/prisma/client';
import type { RagScore } from '@/features/documents/contracts/rag-score.types';

type CreateDocumentVersionInput = {
  documentId: string;
  organizationId: string;
  content: string;
  title: string;
  changeType: ChangeType;
  authorId: string | null;
  ragScore?: RagScore | null;
  metadata?: Record<string, unknown> | null;
  comment?: string | null;
};

/**
 * Append a version and make it the active one.
 *
 * Callers must have already established that `documentId` belongs to
 * `organizationId` — this writes the tenant column it is given and does not
 * re-check it.
 */
export async function createDocumentVersionCommand(
  input: CreateDocumentVersionInput,
): Promise<DocumentVersion> {
  const {
    documentId,
    organizationId,
    content,
    title,
    changeType,
    authorId,
    ragScore,
    metadata,
    comment,
  } = input;

  return db.$transaction(async (tx) => {
    // Serialise on the parent document row. Reading the highest version number
    // inside the transaction is not enough on its own: two concurrent saves can
    // still both read N under read-committed and both try to write N+1, and the
    // (document_id, version_number) unique constraint then fails the loser with
    // a constraint error rather than the queue it deserves. The lock makes the
    // second save wait and read N+1.
    await tx.$queryRaw`
      SELECT id FROM user_documents
      WHERE id = ${documentId}::uuid AND organization_id = ${organizationId}
      FOR UPDATE
    `;

    const lastVersion = await tx.documentVersion.findFirst({
      where: { documentId, organizationId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });

    await tx.documentVersion.updateMany({
      where: { documentId, organizationId, isActive: true },
      data: { isActive: false },
    });

    return tx.documentVersion.create({
      data: {
        documentId,
        organizationId,
        versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
        content,
        title,
        changeType,
        authorId,
        ragScore: (ragScore as Prisma.InputJsonValue | undefined) ?? undefined,
        metadata: (metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        comment,
        isActive: true,
      },
    });
  });
}
