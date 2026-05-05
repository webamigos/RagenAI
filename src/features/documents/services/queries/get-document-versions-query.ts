import db from '@ragenai/prisma-client';
import type {
  DocumentVersionSummary,
  DocumentVersionDetail,
} from '@/features/documents/contracts/document-version.types';
import type { RagScore } from '@/features/documents/contracts/rag-score.types';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';

export const getDocumentVersionsQuery = async (
  documentId: string,
): Promise<DocumentVersionSummary[]> => {
  const orgId = await getOrgIdFromAuthOrThrow();

  const doc = await db.userDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
    select: { id: true },
  });

  if (!doc) {
    throw new Error('Document not found');
  }

  const versions = await db.documentVersion.findMany({
    where: { documentId },
    orderBy: { versionNumber: 'desc' },
    select: {
      id: true,
      versionNumber: true,
      changeType: true,
      authorId: true,
      author: { select: { name: true } },
      comment: true,
      ragScore: true,
      isActive: true,
      createdAt: true,
    },
  });

  return versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    changeType: v.changeType,
    authorId: v.authorId,
    authorName: v.author?.name ?? null,
    comment: v.comment,
    ragScore: v.ragScore as RagScore | null,
    isActive: v.isActive,
    createdAt: v.createdAt,
  }));
};

export const getDocumentVersionDetailQuery = async (
  documentId: string,
  versionId: string,
): Promise<DocumentVersionDetail> => {
  const orgId = await getOrgIdFromAuthOrThrow();

  const doc = await db.userDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
    select: { id: true },
  });

  if (!doc) {
    throw new Error('Document not found');
  }

  const version = await db.documentVersion.findFirst({
    where: { id: versionId, documentId },
    select: {
      id: true,
      versionNumber: true,
      content: true,
      title: true,
      metadata: true,
      changeType: true,
      authorId: true,
      author: { select: { name: true } },
      comment: true,
      ragScore: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!version) {
    throw new Error('Version not found');
  }

  return {
    id: version.id,
    versionNumber: version.versionNumber,
    content: version.content,
    title: version.title,
    metadata: version.metadata as Record<string, unknown> | null,
    changeType: version.changeType,
    authorId: version.authorId,
    authorName: version.author?.name ?? null,
    comment: version.comment,
    ragScore: version.ragScore as RagScore | null,
    isActive: version.isActive,
    createdAt: version.createdAt,
  };
};
