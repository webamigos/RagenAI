const DEFAULT_REGION = 'fr-par';
const API_HOST = 'https://api.scaleway.com';
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

type ScalewayAction = 'decrypt';

/**
 * Thin HTTP client for Scaleway Key Manager.
 * Auth: header X-Auth-Token: <SCW_API_KEY>
 * Required env: SCW_API_KEY
 * Optional env: SCW_KEY_MANAGER_REGION (default: fr-par)
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

  async decryptDataKey(keyId: string, ciphertext: string): Promise<Buffer> {
    const data = await this.post<{ plaintext: string }>(keyId, 'decrypt', {
      ciphertext,
    });
    if (!data.plaintext) {
      throw new Error('Scaleway Key Manager decrypt returned empty plaintext');
    }
    const dek = Buffer.from(data.plaintext, 'base64');
    if (dek.length !== 32) {
      throw new Error(
        `Invalid DEK length from Scaleway KMS: expected 32 bytes, got ${dek.length}`,
      );
    }
    return dek;
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
