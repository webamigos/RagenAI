import { Buffer } from 'node:buffer';

/**
 * Accept the master key in either encoding, because the repository has been
 * telling operators to use the one this file could not read.
 *
 * `.env.example` documents a 64-character hex string, `apps/web` and
 * `apps/api` require exactly that (`/^[0-9a-fA-F]{64}$/`, decoded as hex),
 * and `inspect-environment.ts` says hex too. The worker decoded base64 and
 * demanded 32 bytes. A 64-character hex string is also valid base64 input —
 * it decodes to 48 bytes — so it did not fail as unparseable, it failed as
 * "wrong length", and the two forms were mutually exclusive: no single value
 * satisfied both apps.
 *
 * The consequence was silent. `isEncryptionConfigured()` returns true for
 * `local` on the presence of the variable alone, so the worker passed the
 * gate and then threw in this constructor — inside the `try` in
 * `apply-dual-content-mode.ts`, whose `catch` logs one warning and returns
 * the masked documents. An organization on the documented configuration
 * asked for dual-content PII and got masked text with no encrypted original
 * beside it, on every ingest, while its setting still read `dual_content`.
 *
 * Hex is checked first and strictly, so a 64-character hex key can never be
 * read as 48 bytes of base64 again. Base64 keeps working because the
 * worker's own tests and any deployment that followed this file rather than
 * the documentation use it.
 *
 * Reading either form is safe: this provider only ever unwraps. Its
 * `KeyProvider` interface has `decryptDataKey` alone, so no wrapped DEK was
 * ever produced here, and nothing can have been written under the encoding
 * that is now also accepted.
 */
export function parseMasterKey(key: string): Buffer {
  const trimmed = key.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  const decoded = Buffer.from(trimmed, 'base64');
  if (decoded.length === 32) {
    return decoded;
  }

  throw new Error(
    'ENCRYPTION_MASTER_KEY must be 32 bytes: a 64-character hex string ' +
      '(what .env.example documents) or base64. Generate one with: ' +
      "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

/*
 * Its own module, separate from `key-provider.ts`, so `validateEnvVars.ts`
 * can reject a malformed key at boot without importing the AWS SDK that
 * `key-provider.ts` pulls in at module scope. Phase D of
 * docs/specs/2026-09-08-one-encryption-package.md deletes both in favour of
 * @ragenai/crypto.
 */
