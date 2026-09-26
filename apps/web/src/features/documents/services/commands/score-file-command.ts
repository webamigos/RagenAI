import db from '@ragenai/prisma-client';
import { decryptDocumentContent } from '@ragenai/crypto';
import { jobs } from '@/libs/jobs';
import { Workflow } from '@/features/documents/contracts/document.types';
import { logger } from '@/app/lib/utils/logger';
import { UnauthorizedException } from '@/libs/utils/errors';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

/**
 * Start the on-demand "Score for RAG" job for one file.
 *
 * It scores the document row's text, decrypted: the same string ingest scores
 * (the file's chunks, joined, after masking), so a click and an upload grade
 * the same thing. Spec 2026-09-26-rag-readiness-score-review, B2.
 *
 * Two things it used to do and no longer does:
 * - send `UserDocument.content` as stored, which for an organization with
 *   encryption on is ciphertext, so the model graded noise;
 * - fall back to the raw stored file when there was no document row, which
 *   sent unparsed text that had never been through PII masking. A file with
 *   no document row has not finished processing, so it is refused instead.
 */
export async function scoreFileCommand(
  fileId: string,
  orgId: string,
): Promise<void> {
  // The menu item is hidden when the key is off; this is the gate a stale
  // client, or a direct call to the action, still meets. Spec
  // 2026-09-26-rag-readiness-score-review, Q6.
  if (!(await isFeatureEnabledQuery(orgId, 'ragReadinessScore'))) {
    throw new UnauthorizedException(
      'Scoring documents for RAG is turned off for this organization',
    );
  }

  const file = await db.userFile.findFirst({
    where: { id: fileId, organizationId: orgId },
    select: {
      id: true,
      fileName: true,
      projectId: true,
      document: { select: { id: true, content: true, encryptedDek: true } },
    },
  });

  if (!file) {
    throw new Error('File not found');
  }

  if (!file.document) {
    throw new Error(
      'This file has not finished processing, so there is no text to score yet',
    );
  }

  const content = await decryptDocumentContent(
    file.document.content,
    file.document.encryptedDek,
  );

  if (!content.trim()) {
    throw new Error('File has no content to score');
  }

  await jobs().start(Workflow.SCORE_DOCUMENT, `score-${fileId}-${Date.now()}`, {
    fileId,
    documentId: file.document.id,
    orgId,
    projectId: file.projectId ?? null,
    fileName: file.fileName ?? undefined,
    documentText: content,
  });

  logger.info({ fileId, orgId }, 'Score document job started');
}
