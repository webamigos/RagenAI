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
export declare class ScalewayKeyProvider implements KeyProvider {
  private readonly keyId;
  private readonly client;
  constructor();
  generateDataKey(): Promise<{
    encryptedDek: string;
    plaintextDek: Buffer;
  }>;
  decryptDataKey(encryptedDek: string): Promise<Buffer>;
}
//# sourceMappingURL=scaleway-provider.d.ts.map
