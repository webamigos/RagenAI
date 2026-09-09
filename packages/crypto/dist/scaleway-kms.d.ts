/**
 * Thin HTTP client for Scaleway Key Manager.
 *
 * The union of the two copies that existed, not a copy of either.
 * `apps/web`'s had the full action set; `apps/worker`'s had a 10-second
 * `AbortController` timeout and a check that the returned DEK is 32 bytes,
 * and only decrypted. Both belong: the timeout matters most in the worker,
 * where this call sits inside a Temporal activity, and the length check turns
 * a confusing failure deep inside `createDecipheriv` into one that names the
 * cause.
 *
 * Auth is `X-Auth-Token: <SCW_API_KEY>` (an IAM secret key with
 * KeyManagerFullAccess). `keyId` is per call so different subjects can use
 * different keys; `ScalewayKeyProvider` reads `SCW_KEY_MANAGER_KEY_ID` and
 * forwards it.
 *
 * Docs: https://www.scaleway.com/en/developers/api/key-manager/
 */
export declare class ScalewayKMSService {
  private readonly apiKey;
  private readonly region;
  private readonly requestTimeoutMs;
  constructor(opts?: {
    apiKey?: string;
    region?: string;
    requestTimeoutMs?: number;
  });
  /**
   * Generate a fresh DEK: the plaintext for immediate use, the KEK-wrapped
   * ciphertext for storage.
   */
  generateDataKey(keyId: string): Promise<{
    plaintext: Buffer;
    ciphertext: string;
  }>;
  /** Unwrap a previously wrapped DEK. */
  decryptDataKey(keyId: string, ciphertext: string): Promise<Buffer>;
  /**
   * Encrypt arbitrary plaintext directly with the KEK. Small payloads only —
   * Scaleway caps a call at 4 KiB. For content, use `generateDataKey` plus
   * the local AES-GCM helpers.
   */
  encrypt(keyId: string, plaintext: Buffer): Promise<string>;
  /** Decrypt arbitrary ciphertext produced by `encrypt`. */
  decrypt(keyId: string, ciphertext: string): Promise<Buffer>;
  private endpoint;
  private post;
}
//# sourceMappingURL=scaleway-kms.d.ts.map
