import { presidioClient } from './presidio-client';
import { logger } from '@/app/lib/utils/logger';

/**
 * Entity types that are considered high-risk when found in a document
 * tagged with pii_policy: NONE. These are identifiers that should
 * never appear unmasked in a "no restrictions" document — their
 * presence likely means the file was mis-classified.
 */
export const HIGH_RISK_ENTITY_TYPES = new Set([
  'PL_PESEL',
  'PL_IBAN',
  'IBAN_CODE',
  'CREDIT_CARD',
  'PL_ID_CARD',
]);

export type HighRiskDetectionResult = {
  detected: boolean;
  entityTypes: string[];
};

/**
 * Scans `text` via Presidio and returns any high-risk entity types found.
 * Intended for documents with pii_policy NONE — their content is stored
 * verbatim in Qdrant, so a mis-classified doc with a PESEL/IBAN/CC
 * would land fully unmasked in the vector store.
 *
 * Fails open on Presidio errors: if the analyzer is unavailable we log
 * and return `detected: false` so the upload is not blocked.
 */
export async function detectHighRiskEntities(
  text: string,
  language = 'pl',
): Promise<HighRiskDetectionResult> {
  let result;
  try {
    result = await presidioClient.anonymize(text, language);
  } catch (err) {
    logger.error(
      { err, textLength: text.length, language },
      'Presidio unavailable during high-risk entity detection — failing open',
    );
    return { detected: false, entityTypes: [] };
  }

  const found = Object.keys(result.aliasMap)
    .map((placeholder) => placeholder.replace(/<([A-Z_]+)_\d+>/, '$1'))
    .filter((entityType) => HIGH_RISK_ENTITY_TYPES.has(entityType));

  const unique = [...new Set(found)];
  return { detected: unique.length > 0, entityTypes: unique };
}
