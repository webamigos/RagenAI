import { logger } from '../../services/logger.js';

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
 * - xlsx/csv with fewer than 100 letters, a letter ratio below 30%, or
 *   less than 0.1 separation between franc's top two relative scores → null.
 *   No organization default exists; undetected is the chosen fallback.
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
    const { franc, francAll } = await import('franc');
    if (/\.(xlsx|csv)$/i.test(fileName ?? '')) {
      // A few headers among numbers are not prose. Do not turn a price list
      // into a confident-looking language tag used by downstream PII masking.
      let letters = 0;
      const unicodeLetter = /\p{L}/u;
      for (const character of trimmed) {
        if (unicodeLetter.test(character)) {
          letters += 1;
        }
      }
      if (letters < 100 || letters / trimmed.length < 0.3) {
        return null;
      }
      const ranked = francAll(trimmed);
      const best = ranked[0];
      const runnerUp = ranked[1];
      // franc scores are relative distances, not probabilities. Require
      // separation from the next result instead of treating the top 1 as
      // absolute confidence. Ambiguous tables remain undetected.
      if (
        !best ||
        best[0] === 'und' ||
        (runnerUp && best[1] - runnerUp[1] < 0.1)
      ) {
        return null;
      }
      return best[0];
    }
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
