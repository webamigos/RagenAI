import db from '@ragenai/prisma-client';
import type { ChangeType, DocumentVersion } from '@/generated/prisma/client';
import type { RagScore } from '@/features/documents/contracts/rag-score.types';

type CreateDocumentVersionInput = {
  documentId: string;
  content: string;
  title: string;
  changeType: ChangeType;
  authorId: string | null;
  ragScore?: RagScore | null;
  metadata?: Record<string, unknown> | null;
  comment?: string | null;
};

export async function createDocumentVersionCommand(
  input: CreateDocumentVersionInput,
): Promise<DocumentVersion> {
  const {
    documentId,
    content,
    title,
    changeType,
    authorId,
    ragScore,
    metadata,
    comment,
  } = input;

  const lastVersion = await db.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  });

  const nextNumber = (lastVersion?.versionNumber ?? 0) + 1;

  return db.$transaction(async (tx) => {
    await tx.documentVersion.updateMany({
      where: { documentId, isActive: true },
      data: { isActive: false },
    });

    return tx.documentVersion.create({
      data: {
        documentId,
        versionNumber: nextNumber,
        content,
        title,
        changeType,
        authorId,
        ragScore: ragScore ?? undefined,
        metadata: metadata ?? undefined,
        comment,
        isActive: true,
      },
    });
  });
}
