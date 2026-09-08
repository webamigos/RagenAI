import { ScalewayKMSService } from '../scaleway-kms';
import type { KeyProvider } from './types';

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
