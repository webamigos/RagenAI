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

export async function rollbackDocumentVersionCommand(
  input: RollbackInput,
): Promise<DocumentVersion> {
  const { documentId, versionId, authorId, orgId } = input;

  const target = await db.documentVersion.findFirst({
    where: { id: versionId, documentId },
    select: {
      id: true,
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
    content: target.content,
    title: target.title,
    changeType: 'ROLLBACK',
    authorId,
    ragScore: target.ragScore as RagScore | null,
    metadata: target.metadata as Record<string, unknown> | null,
    comment: `Rollback to version ${versionId}`,
  });

  await db.userDocument.updateMany({
    where: { id: documentId, organizationId: orgId },
    data: { content: target.content, updatedAt: new Date() },
  });

  return newVersion;
}
