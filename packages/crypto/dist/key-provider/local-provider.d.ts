import type { KeyProvider } from './types';
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
export declare class LocalKeyProvider implements KeyProvider {
  private readonly masterKey;
  constructor();
  generateDataKey(): Promise<{
    encryptedDek: string;
    plaintextDek: Buffer;
  }>;
  decryptDataKey(encryptedDek: string): Promise<Buffer>;
  private wrapKey;
  private unwrapKey;
}
//# sourceMappingURL=local-provider.d.ts.map
