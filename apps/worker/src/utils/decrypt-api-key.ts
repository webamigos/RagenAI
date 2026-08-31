import { AES, enc } from 'crypto-js';

/**
 * Decrypts an AES-encrypted API key using the shared SECRET_KEY.
 *
 * Mirrors the encryption used by ragen-app (`src/app/lib/utils/hashApiKey.ts`)
 * so the worker can read per-organization LiteLLM virtual keys that ragen-app
 * stores in `organization_settings.litellm_api_key`.
 */
export function decryptApiKey(encryptedApiKey: string): string {
  const secret = process.env.SECRET_KEY;
  if (!secret) {
    throw new Error('SECRET_KEY env var is required to decrypt API keys');
  }

  let decoded: string;
  try {
    decoded = AES.decrypt(encryptedApiKey, secret).toString(enc.Utf8);
  } catch (err) {
    throw new Error(
      `Failed to decrypt API key: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // crypto-js returns '' for both an empty plaintext and a wrong key / corrupt
  // ciphertext — treat that as a hard failure so callers don't silently send
  // an empty Authorization header.
  if (!decoded.trim()) {
    throw new Error(
      'Failed to decrypt API key: result was empty (likely wrong SECRET_KEY or corrupted ciphertext)',
    );
  }

  return decoded;
}
