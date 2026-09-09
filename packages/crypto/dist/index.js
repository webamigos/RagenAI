'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.isEncryptionEnabled =
  exports.generateThreadKey =
  exports.encryptMessages =
  exports.decryptThreadKey =
  exports.decryptMessages =
  exports.decryptMessageContents =
  exports.decryptDocumentContent =
  exports.clearDekCache =
  exports.ScalewayKeyProvider =
  exports.LocalKeyProvider =
  exports.KmsKeyProvider =
  exports.resetKeyProviderForTests =
  exports.isEncryptionConfigured =
  exports.getKeyProvider =
  exports.ScalewayKMSService =
  exports.parseMasterKey =
  exports.decryptContent =
  exports.encryptContent =
    void 0;
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
var envelope_1 = require('./envelope');
Object.defineProperty(exports, 'encryptContent', {
  enumerable: true,
  get: function () {
    return envelope_1.encryptContent;
  },
});
Object.defineProperty(exports, 'decryptContent', {
  enumerable: true,
  get: function () {
    return envelope_1.decryptContent;
  },
});
var master_key_1 = require('./master-key');
Object.defineProperty(exports, 'parseMasterKey', {
  enumerable: true,
  get: function () {
    return master_key_1.parseMasterKey;
  },
});
var scaleway_kms_1 = require('./scaleway-kms');
Object.defineProperty(exports, 'ScalewayKMSService', {
  enumerable: true,
  get: function () {
    return scaleway_kms_1.ScalewayKMSService;
  },
});
var key_provider_1 = require('./key-provider');
Object.defineProperty(exports, 'getKeyProvider', {
  enumerable: true,
  get: function () {
    return key_provider_1.getKeyProvider;
  },
});
Object.defineProperty(exports, 'isEncryptionConfigured', {
  enumerable: true,
  get: function () {
    return key_provider_1.isEncryptionConfigured;
  },
});
Object.defineProperty(exports, 'resetKeyProviderForTests', {
  enumerable: true,
  get: function () {
    return key_provider_1.resetKeyProviderForTests;
  },
});
var kms_provider_1 = require('./key-provider/kms-provider');
Object.defineProperty(exports, 'KmsKeyProvider', {
  enumerable: true,
  get: function () {
    return kms_provider_1.KmsKeyProvider;
  },
});
var local_provider_1 = require('./key-provider/local-provider');
Object.defineProperty(exports, 'LocalKeyProvider', {
  enumerable: true,
  get: function () {
    return local_provider_1.LocalKeyProvider;
  },
});
var scaleway_provider_1 = require('./key-provider/scaleway-provider');
Object.defineProperty(exports, 'ScalewayKeyProvider', {
  enumerable: true,
  get: function () {
    return scaleway_provider_1.ScalewayKeyProvider;
  },
});
var thread_encryption_1 = require('./thread-encryption');
Object.defineProperty(exports, 'clearDekCache', {
  enumerable: true,
  get: function () {
    return thread_encryption_1.clearDekCache;
  },
});
Object.defineProperty(exports, 'decryptDocumentContent', {
  enumerable: true,
  get: function () {
    return thread_encryption_1.decryptDocumentContent;
  },
});
Object.defineProperty(exports, 'decryptMessageContents', {
  enumerable: true,
  get: function () {
    return thread_encryption_1.decryptMessageContents;
  },
});
Object.defineProperty(exports, 'decryptMessages', {
  enumerable: true,
  get: function () {
    return thread_encryption_1.decryptMessages;
  },
});
Object.defineProperty(exports, 'decryptThreadKey', {
  enumerable: true,
  get: function () {
    return thread_encryption_1.decryptThreadKey;
  },
});
Object.defineProperty(exports, 'encryptMessages', {
  enumerable: true,
  get: function () {
    return thread_encryption_1.encryptMessages;
  },
});
Object.defineProperty(exports, 'generateThreadKey', {
  enumerable: true,
  get: function () {
    return thread_encryption_1.generateThreadKey;
  },
});
Object.defineProperty(exports, 'isEncryptionEnabled', {
  enumerable: true,
  get: function () {
    return thread_encryption_1.isEncryptionEnabled;
  },
});
//# sourceMappingURL=index.js.map
