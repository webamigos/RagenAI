import { db } from '../../services/db/db.js';
import { logger } from '../../services/logger.js';
import { syncRagScoreToVersion } from '../db/sync-rag-score-to-version.js';
import { isRagScoringEnabled } from './is-rag-scoring-enabled.js';
import { scoreDocumentForRag } from './score-document-for-rag.js';

/**
 * The score Optimize compares its suggestions against, computed when the
 * document has none (spec 2026-09-26-rag-readiness-score-review, D3).
 *
 * "Oceń dla RAG" was the only way to get a score once upload stopped scoring
 * by default (D1), and D3 removes it from the menu: its job is the Optimize
 * tab's "Analyse". Without this, removing the item would have left every new
 * document without the before-and-after A4 found useful — the Optimize job
 * only ever carried a score someone else had computed.
 *
 * Stored where the scoring job stores it — the file's metadata and the
 * active version — so the list badge, Version history and the tab agree.
 * Returns the total, or `null` when the organization does not score, the
 * document is gone or empty, or the model returned nothing.
 */
export async function scoreDocumentBaseline({
  documentId,
  orgId,
  projectId,
  userId,
}: {
  documentId: string;
  orgId: string;
  projectId?: string | null;
  userId?: string | null;
}): Promise<number | null> {
  // `ragReadinessScore` off: Optimize still suggests, and shows no score.
  if (!(await isRagScoringEnabled({ orgId }))) {
    return null;
  }

  // Decrypted, like every other read of a document's text (B7).
  const document = await db.getDocumentContent(documentId, orgId);
  if (!document || document.content.trim() === '') {
    return null;
  }

  const ragScore = await scoreDocumentForRag({
    documentText: document.content,
    orgId,
    projectId,
    userId,
    fileName: document.title ?? undefined,
  });
  if (!ragScore) {
    return null;
  }

  const fileId = await db.getFileIdForDocument(documentId, orgId);
  if (fileId) {
    await db.mergeFileMetadata({
      where: { fileId, orgId },
      patch: { ragScore, ragScoredAt: new Date().toISOString() },
    });
  } else {
    logger.info(
      { documentId, orgId },
      'Scored a document with no file; the score lives on its version only',
    );
  }
  await syncRagScoreToVersion({
    documentId,
    orgId,
    ragScore: ragScore as unknown as Record<string, unknown>,
  });

  return ragScore.total;
}
