'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.LocalKeyProvider = void 0;
const node_crypto_1 = require('node:crypto');
const master_key_1 = require('../master-key');
const WRAP_ALGORITHM = 'aes-256-gcm';
const WRAP_IV_LENGTH = 12;
const WRAP_AUTH_TAG_LENGTH = 16;
/**
 * On-premise deployments with no managed KMS: `ENCRYPTION_MASTER_KEY` wraps
 * and unwraps DEKs directly, via AES-256-GCM.
 *
 * The wrapped-DEK layout is the same shape as the content envelope but a
 * separate constant set, because the two are independent contracts — nothing
 * says a future change to one applies to the other.
 *
 * Generate a key with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
class LocalKeyProvider {
  masterKey;
  constructor() {
    const key = process.env.ENCRYPTION_MASTER_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_MASTER_KEY is not configured');
    }
    this.masterKey = (0, master_key_1.parseMasterKey)(key);
  }
  async generateDataKey() {
    const plaintextDek = (0, node_crypto_1.randomBytes)(32);
    return { encryptedDek: this.wrapKey(plaintextDek), plaintextDek };
  }
  async decryptDataKey(encryptedDek) {
    return this.unwrapKey(encryptedDek);
  }
  wrapKey(plaintext) {
    const iv = (0, node_crypto_1.randomBytes)(WRAP_IV_LENGTH);
    const cipher = (0, node_crypto_1.createCipheriv)(
      WRAP_ALGORITHM,
      this.masterKey,
      iv,
      {
        authTagLength: WRAP_AUTH_TAG_LENGTH,
      },
    );
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, encrypted, authTag]).toString('base64');
  }
  unwrapKey(wrappedBase64) {
    const packed = Buffer.from(wrappedBase64, 'base64');
    const minLength = WRAP_IV_LENGTH + WRAP_AUTH_TAG_LENGTH + 1;
    if (packed.length < minLength) {
      throw new Error(
        `Invalid wrapped key: data too short (${packed.length} bytes, need at least ${minLength})`,
      );
    }
    const iv = packed.subarray(0, WRAP_IV_LENGTH);
    const authTag = packed.subarray(packed.length - WRAP_AUTH_TAG_LENGTH);
    const ciphertext = packed.subarray(
      WRAP_IV_LENGTH,
      packed.length - WRAP_AUTH_TAG_LENGTH,
    );
    const decipher = (0, node_crypto_1.createDecipheriv)(
      WRAP_ALGORITHM,
      this.masterKey,
      iv,
      {
        authTagLength: WRAP_AUTH_TAG_LENGTH,
      },
    );
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
exports.LocalKeyProvider = LocalKeyProvider;
//# sourceMappingURL=local-provider.js.map
