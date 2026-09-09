'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ScalewayKeyProvider = void 0;
const scaleway_kms_1 = require('../scaleway-kms');
/**
 * Scaleway Key Manager — the current target stack.
 *
 * Functional analogue of AWS KMS: the KEK stays in the service and never
 * leaves; calls exchange it for fresh DEKs and for unwrapping.
 *
 * Required env:
 *   SCW_KEY_MANAGER_KEY_ID — a key created in the Scaleway Console
 *                            (Security → Key Manager → Generate key,
 *                             algorithm aes_256_gcm, usage encrypt-decrypt)
 *   SCW_API_KEY            — IAM secret key with KeyManagerFullAccess
 * Optional:
 *   SCW_KEY_MANAGER_REGION — defaults to fr-par
 */
class ScalewayKeyProvider {
  keyId;
  client;
  constructor() {
    const keyId = process.env.SCW_KEY_MANAGER_KEY_ID;
    if (!keyId) {
      throw new Error('SCW_KEY_MANAGER_KEY_ID is not configured');
    }
    this.keyId = keyId;
    this.client = new scaleway_kms_1.ScalewayKMSService();
  }
  async generateDataKey() {
    const { plaintext, ciphertext } = await this.client.generateDataKey(
      this.keyId,
    );
    return { encryptedDek: ciphertext, plaintextDek: plaintext };
  }
  async decryptDataKey(encryptedDek) {
    return this.client.decryptDataKey(this.keyId, encryptedDek);
  }
}
exports.ScalewayKeyProvider = ScalewayKeyProvider;
//# sourceMappingURL=scaleway-provider.js.map
