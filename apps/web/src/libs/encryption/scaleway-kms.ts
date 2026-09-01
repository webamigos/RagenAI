const DEFAULT_REGION = 'fr-par';
const API_HOST = 'https://api.scaleway.com';

type ScalewayAction = 'generate-data-key' | 'encrypt' | 'decrypt';

/**
 * Thin HTTP client for Scaleway Key Manager.
 *
 * API base: https://api.scaleway.com/key-manager/v1alpha1/regions/{region}/keys/{key_id}/{action}
 * Auth: header `X-Auth-Token: <SCW_API_KEY>` (IAM secret key with
 *       KeyManagerFullAccess scope).
 *
 * Reads `SCW_API_KEY` and (optional) `SCW_KEY_MANAGER_REGION` from env.
 * `keyId` is passed per-call so callers can use different keys for different
 * subjects (per-org, per-purpose, etc.) — the provider in
 * `src/libs/crypto/key-provider/scaleway-provider.ts` reads
 * `SCW_KEY_MANAGER_KEY_ID` and forwards it here.
 *
 * Docs: https://www.scaleway.com/en/developers/api/key-manager/
 */
export class ScalewayKMSService {
  private readonly apiKey: string;
  private readonly region: string;

  constructor(opts?: { apiKey?: string; region?: string }) {
    const apiKey = opts?.apiKey ?? process.env.SCW_API_KEY;
    if (!apiKey) {
      throw new Error('SCW_API_KEY is required for ScalewayKMSService');
    }
    this.apiKey = apiKey;
    this.region =
      opts?.region ?? process.env.SCW_KEY_MANAGER_REGION ?? DEFAULT_REGION;
  }

  /**
   * Generate a fresh data encryption key (DEK). Returns the plaintext DEK
   * for immediate use and the ciphertext (KEK-wrapped) DEK for storage.
   */
  async generateDataKey(
    keyId: string,
  ): Promise<{ plaintext: Buffer; ciphertext: string }> {
    const data = await this.post<{
      plaintext: string;
      ciphertext: string;
    }>(keyId, 'generate-data-key', { algorithm: 'aes_256_gcm' });

    if (!data.plaintext || !data.ciphertext) {
      throw new Error(
        'Scaleway Key Manager generate-data-key returned incomplete response',
      );
    }

    return {
      plaintext: Buffer.from(data.plaintext, 'base64'),
      ciphertext: data.ciphertext,
    };
  }

  /**
   * Decrypt (unwrap) a previously encrypted DEK back to plaintext.
   */
  async decryptDataKey(keyId: string, ciphertext: string): Promise<Buffer> {
    const data = await this.post<{ plaintext: string }>(keyId, 'decrypt', {
      ciphertext,
    });
    if (!data.plaintext) {
      throw new Error('Scaleway Key Manager decrypt returned empty plaintext');
    }
    return Buffer.from(data.plaintext, 'base64');
  }

  /**
   * Encrypt arbitrary plaintext directly with the KEK. Use only for small
   * payloads (Scaleway has size limits — 4 KiB per call). For message
   * content prefer `generateDataKey` + local AES-GCM (envelope encryption).
   */
  async encrypt(keyId: string, plaintext: Buffer): Promise<string> {
    const data = await this.post<{ ciphertext: string }>(keyId, 'encrypt', {
      plaintext: plaintext.toString('base64'),
    });
    if (!data.ciphertext) {
      throw new Error('Scaleway Key Manager encrypt returned empty ciphertext');
    }
    return data.ciphertext;
  }

  /**
   * Decrypt arbitrary ciphertext previously produced by `encrypt`.
   */
  async decrypt(keyId: string, ciphertext: string): Promise<Buffer> {
    const data = await this.post<{ plaintext: string }>(keyId, 'decrypt', {
      ciphertext,
    });
    if (!data.plaintext) {
      throw new Error('Scaleway Key Manager decrypt returned empty plaintext');
    }
    return Buffer.from(data.plaintext, 'base64');
  }

  private endpoint(keyId: string, action: ScalewayAction): string {
    return `${API_HOST}/key-manager/v1alpha1/regions/${this.region}/keys/${keyId}/${action}`;
  }

  private async post<T>(
    keyId: string,
    action: ScalewayAction,
    body: object,
  ): Promise<T> {
    const response = await fetch(this.endpoint(keyId, action), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': this.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(
        `Scaleway Key Manager ${action} failed (${response.status}): ${errBody}`,
      );
    }
    return (await response.json()) as T;
  }
}
