import type { KeyProvider } from './types';
/**
 * AWS KMS — the legacy provider, kept for hybrid setups.
 *
 * `@aws-sdk/client-kms` is a plain dependency of this package rather than an
 * optional peer. An optional peer looked attractive (several megabytes that a
 * Scaleway-only deployment never uses) and does not work: `apps/worker`'s
 * image installs with `npm ci --workspace=@webamigos/ragen-worker …`, which
 * resolves that workspace's manifest and not the root's, so the SDK would be
 * absent and a lazy `import()` would throw `MODULE_NOT_FOUND` — inside the
 * `try` in `apply-dual-content-mode.ts`, which turns any provider failure
 * into a silent fallback to destructive PII mode. The test would still have
 * passed locally, where the root hoists the SDK.
 *
 * The credentials block is omitted unless both halves are present, so an
 * instance running under an IAM role picks them up from the environment.
 */
export declare class KmsKeyProvider implements KeyProvider {
  private readonly client;
  private readonly keyId;
  constructor();
  generateDataKey(): Promise<{
    encryptedDek: string;
    plaintextDek: Buffer;
  }>;
  decryptDataKey(encryptedDek: string): Promise<Buffer>;
}
//# sourceMappingURL=kms-provider.d.ts.map
