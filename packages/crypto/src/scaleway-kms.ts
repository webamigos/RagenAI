const DEFAULT_REGION = 'fr-par';
const API_HOST = 'https://api.scaleway.com';
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

type ScalewayAction = 'generate-data-key' | 'encrypt' | 'decrypt';

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
export class ScalewayKMSService {
  private readonly apiKey: string;
  private readonly region: string;
  private readonly requestTimeoutMs: number;

  constructor(opts?: {
    apiKey?: string;
    region?: string;
    requestTimeoutMs?: number;
  }) {
    const apiKey = opts?.apiKey ?? process.env.SCW_API_KEY;
    if (!apiKey) {
      throw new Error('SCW_API_KEY is required for ScalewayKMSService');
    }
    this.apiKey = apiKey;
    this.region =
      opts?.region ?? process.env.SCW_KEY_MANAGER_REGION ?? DEFAULT_REGION;
    this.requestTimeoutMs =
      opts?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Generate a fresh DEK: the plaintext for immediate use, the KEK-wrapped
   * ciphertext for storage.
   */
  async generateDataKey(
    keyId: string,
  ): Promise<{ plaintext: Buffer; ciphertext: string }> {
    const data = await this.post<{ plaintext: string; ciphertext: string }>(
      keyId,
      'generate-data-key',
      { algorithm: 'aes_256_gcm' },
    );

    if (!data.plaintext || !data.ciphertext) {
      throw new Error(
        'Scaleway Key Manager generate-data-key returned incomplete response',
      );
    }

    return {
      plaintext: assertDekLength(Buffer.from(data.plaintext, 'base64')),
      ciphertext: data.ciphertext,
    };
  }

  /** Unwrap a previously wrapped DEK. */
  async decryptDataKey(keyId: string, ciphertext: string): Promise<Buffer> {
    const data = await this.post<{ plaintext: string }>(keyId, 'decrypt', {
      ciphertext,
    });
    if (!data.plaintext) {
      throw new Error('Scaleway Key Manager decrypt returned empty plaintext');
    }
    return assertDekLength(Buffer.from(data.plaintext, 'base64'));
  }

  /**
   * Encrypt arbitrary plaintext directly with the KEK. Small payloads only —
   * Scaleway caps a call at 4 KiB. For content, use `generateDataKey` plus
   * the local AES-GCM helpers.
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

  /** Decrypt arbitrary ciphertext produced by `encrypt`. */
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(this.endpoint(keyId, action), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(
          `Scaleway Key Manager ${action} timed out after ${this.requestTimeoutMs}ms`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(
        `Scaleway Key Manager ${action} failed (${response.status}): ${errBody}`,
      );
    }

    return (await response.json()) as T;
  }
}

/**
 * A DEK that is not 32 bytes cannot key AES-256, and `createDecipheriv`
 * reports that as an opaque "Invalid key length" far from here. Only
 * `apps/worker`'s copy checked; keeping the check is strictly better than
 * dropping it.
 */
function assertDekLength(dek: Buffer): Buffer {
  if (dek.length !== 32) {
    throw new Error(
      `Invalid DEK length from Scaleway KMS: expected 32 bytes, got ${dek.length}`,
    );
  }
  return dek;
}
