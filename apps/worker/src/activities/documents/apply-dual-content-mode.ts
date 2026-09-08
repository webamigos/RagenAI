import type { Document } from '../../types/Document';
import { db } from '../../services/db/db';
import { getKeyProvider, isEncryptionConfigured } from '@ragenai/crypto';
import { encryptContent } from '@ragenai/crypto';
import { logger } from '../../services/logger';

/**
 * Enriches masked docs with encrypted original content for dual-content ingestion.
 * In `dual_content` mode, adds `metadata.content_original` (AES-256-GCM encrypted
 * original text) and `metadata.pii_mode: 'dual_content'` to each document.
 * Falls back to returning maskedDocs unchanged when encryption is not configured
 * or no DEK is found in DB.
 */
export async function applyDualContentMode({
  originalDocs,
  maskedDocs,
  orgId,
}: {
  originalDocs: Document[];
  maskedDocs: Document[];
  orgId: string;
}): Promise<Document[]> {
  const mode = await db.getPiiIngestionMode(orgId);

  if (mode !== 'dual_content') {
    return maskedDocs;
  }

  if (!isEncryptionConfigured()) {
    logger.warn(
      { orgId },
      'applyDualContentMode: encryption not configured — falling back to destructive mode',
    );
    return maskedDocs;
  }

  const encryptedDek = await db.getEncryptedPiiDek(orgId);

  if (!encryptedDek) {
    logger.warn(
      { orgId },
      'applyDualContentMode: no PII DEK found in DB — falling back to destructive mode',
    );
    return maskedDocs;
  }

  let dek: Buffer;
  try {
    dek = await getKeyProvider().decryptDataKey(encryptedDek);
  } catch (err) {
    logger.error(
      { orgId, err: err instanceof Error ? err.message : String(err) },
      'applyDualContentMode: failed to decrypt PII DEK — falling back to destructive mode',
    );
    return maskedDocs;
  }

  if (originalDocs.length !== maskedDocs.length) {
    throw new Error(
      `applyDualContentMode: doc array length mismatch ` +
        `(original=${originalDocs.length}, masked=${maskedDocs.length})`,
    );
  }

  return maskedDocs.map((maskedDoc, i) => {
    const originalText = originalDocs[i].pageContent;
    try {
      const contentOriginal = encryptContent(originalText, dek);
      return {
        ...maskedDoc,
        metadata: {
          ...maskedDoc.metadata,
          pii_mode: 'dual_content',
          content_original: contentOriginal,
        },
      };
    } catch (err) {
      logger.error(
        {
          orgId,
          docIndex: i,
          err: err instanceof Error ? err.message : String(err),
        },
        'applyDualContentMode: failed to encrypt document — storing masked content only',
      );
      return maskedDoc;
    }
  });
}
