import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from '@aws-sdk/client-kms';

import type { KeyProvider } from './types';

/** Matches `ScalewayKMSService`'s `DEFAULT_REQUEST_TIMEOUT_MS`. */
const KMS_TIMEOUT_MS = 10_000;

/**
 * AWS KMS — the legacy provider, kept for hybrid setups.
 *
 * `@aws-sdk/client-kms` is a plain dependency of this package rather than an
 * optional peer. An optional peer looked attractive (several megabytes that a
 * Scaleway-only deployment never uses) and does not work: `apps/worker`'s
 * image installs with `npm ci --workspace=@ragenai/worker …`, which
 * resolves that workspace's manifest and not the root's, so the SDK would be
 * absent and a lazy `import()` would throw `MODULE_NOT_FOUND` — inside the
 * `try` in `apply-dual-content-mode.ts`, which turns any provider failure
 * into a silent fallback to destructive PII mode. The test would still have
 * passed locally, where the root hoists the SDK.
 *
 * The credentials block is omitted unless both halves are present, so an
 * instance running under an IAM role picks them up from the environment.
 */
export class KmsKeyProvider implements KeyProvider {
  private readonly client: KMSClient;
  private readonly keyId: string;

  constructor() {
    const keyId = process.env.AWS_KMS_KEY_ID;
    if (!keyId) {
      throw new Error('AWS_KMS_KEY_ID is not configured');
    }
    this.keyId = keyId;

    this.client = new KMSClient({
      endpoint: process.env.AWS_ENDPOINT_URL,
      region: process.env.AWS_DEFAULT_REGION,
      /**
       * Finite, because `probeEncryptionProvider()` calls this on the boot
       * path and the SDK ships `DEFAULT_REQUEST_TIMEOUT = 0` — no timeout at
       * all. A KMS endpoint that accepts a socket and never answers would
       * hang `apps/api` before `NestFactory.create()` and `apps/web`'s
       * `register()` indefinitely: not a failed deploy, which is
       * recoverable, but a service that never finishes starting and reports
       * nothing.
       *
       * `throwOnRequestTimeout` is not redundant. `requestTimeout` on its own
       * only emits a warning — the SDK says so in its own types — and a
       * warning does not unblock an awaited promise.
       *
       * Ten seconds mirrors `ScalewayKMSService`'s own deadline, so the two
       * providers fail on the same budget rather than on whichever SDK
       * happens to be underneath.
       */
      requestHandler: {
        connectionTimeout: KMS_TIMEOUT_MS,
        requestTimeout: KMS_TIMEOUT_MS,
        throwOnRequestTimeout: true,
      },
      ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }

  async generateDataKey(): Promise<{
    encryptedDek: string;
    plaintextDek: Buffer;
  }> {
    const response = await this.client.send(
      new GenerateDataKeyCommand({ KeyId: this.keyId, KeySpec: 'AES_256' }),
    );

    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new Error('KMS GenerateDataKey returned incomplete response');
    }

    return {
      encryptedDek: Buffer.from(response.CiphertextBlob).toString('base64'),
      plaintextDek: assertDekLength(Buffer.from(response.Plaintext)),
    };
  }

  async decryptDataKey(encryptedDek: string): Promise<Buffer> {
    const response = await this.client.send(
      new DecryptCommand({
        // Named, though KMS can infer it from the ciphertext: without it a
        // blob wrapped under a *different* key this principal may use would
        // decrypt happily, so the key this provider is configured with would
        // stop being the boundary it is meant to be.
        KeyId: this.keyId,
        CiphertextBlob: Buffer.from(encryptedDek, 'base64'),
      }),
    );

    if (!response.Plaintext) {
      throw new Error('KMS Decrypt returned empty plaintext');
    }

    return assertDekLength(Buffer.from(response.Plaintext));
  }
}

/**
 * The Scaleway client checks this and the AWS one did not, which is the kind
 * of asymmetry that survives precisely because both paths usually return 32
 * bytes. A shorter key reaches `dekCache` and then fails inside
 * `createDecipheriv` as an opaque "Invalid key length", far from the cause.
 */
function assertDekLength(dek: Buffer): Buffer {
  if (dek.length !== 32) {
    throw new Error(
      `Invalid DEK length from AWS KMS: expected 32 bytes, got ${dek.length}`,
    );
  }
  return dek;
}
