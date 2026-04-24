import type { KeyProvider } from './types';
import { ScalewayKMSService } from '@/libs/encryption/scaleway-kms';

/**
 * Scaleway Key Manager provider for envelope encryption.
 *
 * Functional analogue of AWS KMS — KEK lives in the Scaleway service and
 * never leaves; we exchange API calls for fresh DEKs and DEK decryption.
 *
 * Required env:
 *   SCW_KEY_MANAGER_KEY_ID  — UUID of a key created in Scaleway Console
 *                             (Security → Key Manager → Generate key,
 *                              algorithm aes_256_gcm, usage encrypt-decrypt)
 *   SCW_API_KEY        — IAM secret key with KeyManagerFullAccess
 *
 * Optional env:
 *   SCW_KEY_MANAGER_REGION  — defaults to "fr-par"
 *
 * Delegates HTTP calls to ScalewayKMSService — keeps this provider focused
 * on the KeyProvider interface contract.
 */
export class ScalewayKeyProvider implements KeyProvider {
  private readonly keyId: string;
  private readonly client: ScalewayKMSService;

  constructor() {
    const keyId = process.env.SCW_KEY_MANAGER_KEY_ID;
    if (!keyId) {
      throw new Error('SCW_KEY_MANAGER_KEY_ID is not configured');
    }
    this.keyId = keyId;
    this.client = new ScalewayKMSService();
  }

  async generateDataKey(): Promise<{
    encryptedDek: string;
    plaintextDek: Buffer;
  }> {
    const { plaintext, ciphertext } = await this.client.generateDataKey(
      this.keyId,
    );
    return { encryptedDek: ciphertext, plaintextDek: plaintext };
  }

  async decryptDataKey(encryptedDek: string): Promise<Buffer> {
    return this.client.decryptDataKey(this.keyId, encryptedDek);
  }
}
