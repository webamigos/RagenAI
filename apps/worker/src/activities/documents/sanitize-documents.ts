import type { Document } from '../../types/Document';
import { type FileType, type UserFile } from '../../types/UserFile';
import { sanitizeIngestedText } from '../../ingest/sanitize';
import { db } from '../../services/db';
import { logger } from '../../services/logger';

/**
 * Phase 4b — ingest-time sanitization activity (ragen-worker side).
 *
 * Runs between the loader step and `splitText` in
 * `workflows/parse-and-embed.ts`. For each parsed document, walks
 * the `pageContent` through `sanitizeIngestedText` which:
 *   1. Strips invisible payloads (zero-width chars, HTML comments,
 *      control chars).
 *   2. Normalizes Unicode via NFKC.
 *   3. Flags suspicious prompt-injection patterns without mutating
 *      the text.
 *
 * When ANY document in the batch is flagged suspicious, the activity:
 *   - Merges `{ suspicious: true, sanitizerPatterns, flaggedAt,
 *     source: 'worker-parse' }` into the `UserFile.metadata` JSONB
 *     column via the existing `mergeFileMetadata` DB helper.
 *   - Inserts a `UPLOAD_SUSPICIOUS_CONTENT` row into `security_events`
 *     via `createSecurityEvent`. The Phase 0.5 escalation rule (3
 *     flagged uploads in 24 hours) bumps severity to `critical` and
 *     triggers the admin alert email when configured.
 *
 * Mirrors the apps/web side in
 * `src/libs/document-loaders/website-loader.ts`. Keep the metadata
 * shape and event payload in sync across both producers so the
 * admin UI can display a unified view of flagged content.
 *
 * Returns the sanitized document array (pageContent replaced, metadata
 * untouched) so downstream activities (`splitText`, embedding, etc.)
 * never see the raw payload.
 *
 * Fail-open: any DB or audit error is logged and the sanitized docs
 * are still returned. A failed flag or audit event MUST NOT abort
 * ingestion — the security value comes from the physical strip, which
 * has already happened in-memory by the time we reach the DB calls.
 */
export async function sanitizeDocuments({
  rawDocs,
  fileId,
  organizationId,
  userId,
  requestId,
  fileName,
  fileType,
}: {
  rawDocs: Document[];
  fileId: UserFile['id'];
  organizationId: UserFile['organizationId'];
  userId?: UserFile['userId'];
  requestId?: UserFile['requestId'];
  fileName: UserFile['fileName'];
  fileType: FileType;
}): Promise<Document[]> {
  // Walk every document; collect any suspicious patterns across all
  // of them so one row covers the whole file even if multi-page
  // parsers produce an array.
  const patterns = new Set<string>();
  const sanitized: Document[] = rawDocs.map((doc) => {
    const result = sanitizeIngestedText(doc.pageContent);
    for (const p of result.patterns) {
      patterns.add(p);
    }
    return {
      pageContent: result.sanitized,
      metadata: doc.metadata,
    };
  });

  if (patterns.size === 0) {
    return sanitized;
  }

  const patternsList = Array.from(patterns);
  const flaggedAt = new Date().toISOString();

  logger.warn(
    { fileId, fileName, fileType, patterns: patternsList },
    'Ingest sanitizer flagged suspicious content in parsed documents',
  );

  // Fire the DB updates in parallel — one merges metadata, one
  // inserts the audit row. Both are best-effort; we swallow errors
  // individually so a single failure doesn't block the other.
  await Promise.allSettled([
    db
      .mergeFileMetadata({
        where: { fileId, orgId: organizationId },
        patch: {
          suspicious: true,
          sanitizerPatterns: patternsList,
          flaggedAt,
          source: 'worker-parse',
        },
      })
      .catch((err) => {
        logger.error(
          { err, fileId },
          'Failed to flag suspicious UserFile metadata (worker-parse)',
        );
      }),
    db
      .createSecurityEvent({
        eventType: 'UPLOAD_SUSPICIOUS_CONTENT',
        severity: 'info',
        source: 'upload',
        organizationId,
        userId: userId ?? null,
        requestId: requestId ?? null,
        metadata: {
          fileId,
          fileName,
          fileType,
          patterns: patternsList,
          producer: 'worker-parse',
        },
      })
      .then((result) => {
        if (!result) {
          logger.error(
            { fileId },
            'Failed to create UPLOAD_SUSPICIOUS_CONTENT security event (worker-parse)',
          );
        }
      })
      .catch((err) => {
        logger.error(
          { err, fileId },
          'Failed to create UPLOAD_SUSPICIOUS_CONTENT security event (worker-parse)',
        );
      }),
  ]);

  return sanitized;
}
