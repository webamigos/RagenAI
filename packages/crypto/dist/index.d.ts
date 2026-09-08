/**
 * Envelope encryption, in one place.
 *
 * This lived three times — `apps/web/src/libs/crypto` plus
 * `apps/web/src/libs/encryption`, `apps/api/src/crypto`, and
 * `apps/worker/src/utils/crypto` — and drifted twice without anyone noticing,
 * because the way it fails is a `logger.warn` and a fallback rather than an
 * error. The worker read `ENCRYPTION_MASTER_KEY` in an encoding nothing else
 * used, and had no AWS provider at all; both silently reduced dual-content
 * PII to masked-only on every ingest. See ADR-02, ADR-06 and
 * docs/specs/2026-09-08-one-encryption-package.md.
 *
 * What does **not** belong here: `apps/web`'s `public-link-token.ts`, which
 * shares the old directory and is HMAC-signing a share token, not envelope
 * encryption; and the `crypto-js` AES used for organization API keys, which
 * is a different contract with different storage.
 */
export { encryptContent, decryptContent } from './envelope';
export { parseMasterKey } from './master-key';
export { ScalewayKMSService } from './scaleway-kms';
export {
  getKeyProvider,
  isEncryptionConfigured,
  resetKeyProviderForTests,
} from './key-provider';
export type { KeyProvider } from './key-provider';
export { KmsKeyProvider } from './key-provider/kms-provider';
export { LocalKeyProvider } from './key-provider/local-provider';
export { ScalewayKeyProvider } from './key-provider/scaleway-provider';
export {
  clearDekCache,
  decryptDocumentContent,
  decryptMessageContents,
  decryptMessages,
  decryptThreadKey,
  encryptMessages,
  generateThreadKey,
  isEncryptionEnabled,
} from './thread-encryption';
//# sourceMappingURL=index.d.ts.map
