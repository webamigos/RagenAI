import db from '@ragenai/prisma-client';
import type { DocumentActor } from './document-access';
import { canAccessDocument } from './get-document-actor';
import type {
  DocumentVersionSummary,
  DocumentVersionDetail,
} from '@/features/documents/contracts/document-version.types';
import type { RagScore } from '@/features/documents/contracts/rag-score.types';

/**
 * `orgId` and `actor` are both required rather than defaulted from the session:
 * these run from route handlers that have already resolved them, and an
 * optional tenant or authorization argument is the kind that eventually gets
 * left out.
 *
 * The two are separate checks. `orgId` keeps another tenant out; `actor` is
 * what keeps a member of *this* tenant out of a document they neither own nor
 * were granted. Version history is document content — the titles, the
 * comments, and in the detail query the full text — so it needs the same
 * permission as the document itself.
 */
export const getDocumentVersionsQuery = async (
  documentId: string,
  orgId: string,
  actor: DocumentActor,
): Promise<DocumentVersionSummary[]> => {
  const doc = await db.userDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
    select: { id: true },
  });

  if (!doc) {
    throw new Error('Document not found');
  }

  // Indistinguishable from "does not exist" on purpose: telling an
  // unauthorized caller that the id is real is itself a disclosure.
  if (!(await canAccessDocument(documentId, orgId, actor))) {
    throw new Error('Document not found');
  }

  const versions = await db.documentVersion.findMany({
    // Scoped on the version too, not just via the document lookup above —
    // tenant-scope-guard.ts checks each query in isolation, and a second
    // condition costs nothing.
    where: { documentId: doc.id, organizationId: orgId },
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
  orgId: string,
  actor: DocumentActor,
): Promise<DocumentVersionDetail> => {
  const doc = await db.userDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
    select: { id: true },
  });

  if (!doc) {
    throw new Error('Document not found');
  }

  if (!(await canAccessDocument(documentId, orgId, actor))) {
    throw new Error('Document not found');
  }

  const version = await db.documentVersion.findFirst({
    where: { id: versionId, documentId, organizationId: orgId },
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
