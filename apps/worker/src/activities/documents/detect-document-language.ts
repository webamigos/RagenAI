import { logger } from '../../services/logger';

/**
 * Detect the dominant language of a document for ingest-time enrichment
 * (one tag per document, not per chunk — see docs/specs/2026-09-04-document-language-metadata.md).
 *
 * `franc` ships ESM-only; `apps/worker` compiles as CommonJS, so it must be
 * dynamically imported rather than statically, same as `file-type` and
 * `read-chunk` elsewhere in this package.
 *
 * Behavior:
 * - Input text below franc's own reliability threshold (its default
 *   `minLength`, 10 characters) or otherwise undetermined → returns `null`.
 *   franc reports this internally as `'und'`; that sentinel is not a useful
 *   value to persist, so it is normalized to `null` here.
 * - franc throws (should not happen — it is a synchronous, dependency-free
 *   heuristic — but is defended against as best-effort enrichment must never
 *   fail the ingest workflow) → logs a warning, returns `null`.
 *
 * Returns an ISO 639-3 code (e.g. `'eng'`, `'pol'`) or `null`.
 */
export async function detectDocumentLanguage({
  documentText,
  fileName,
}: {
  documentText: string;
  fileName?: string;
}): Promise<string | null> {
  const trimmed = documentText.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    const { franc } = await import('franc');
    const detected = franc(trimmed);
    if (detected === 'und') {
      return null;
    }
    return detected;
  } catch (err) {
    logger.warn(
      { err, fileName },
      'Document language detection failed, continuing without a language tag',
    );
    return null;
  }
}
