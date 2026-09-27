import db from '@ragenai/prisma-client';
import { decryptDocumentContent } from '@ragenai/crypto';
import { jobs } from '@/libs/jobs';
import { Workflow } from '@/features/documents/contracts/document.types';
import { logger } from '@/app/lib/utils/logger';
import { UnauthorizedException } from '@/libs/utils/errors';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { getDocumentActor } from '@/features/documents/services/queries/get-document-actor';
import { fileAccessWhere } from '@/features/documents/services/queries/document-access';
import { isTabularFileType } from '@/features/documents/utils/tabular-documents';

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
 *
 * The file is looked up with the member's own access (`fileAccessWhere`), as
 * the document queries are: scoping by organization alone let any member
 * start a job that sent a private document's text to the model. A file the
 * member may not open reads as not found, like one that does not exist.
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

  const actor = await getDocumentActor(orgId);
  const file = await db.userFile.findFirst({
    where: { id: fileId, organizationId: orgId, ...fileAccessWhere(actor) },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      projectId: true,
      document: { select: { id: true, content: true, encryptedDek: true } },
    },
  });

  if (!file) {
    throw new Error('File not found');
  }

  // Q4: the rubric grades prose, and Phase A measured it at its least
  // meaningful on a spreadsheet. Refused here, not only by hiding the menu
  // item, so a stale client or a direct call to the action meets it too —
  // and before the text is decrypted, which this answer does not need.
  if (isTabularFileType(file.fileType)) {
    throw new Error(
      'Spreadsheets are not scored for RAG: the score grades prose. Re-process the file instead if its tables were read badly',
    );
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
