import { AES, enc } from 'crypto-js';

// Ported from ragen-app's src/app/lib/utils/hashApiKey.ts — small,
// self-contained AES encrypt/decrypt for provider API keys stored on
// OrganizationSettings. NOT the same thing as the KMS envelope encryption
// for thread messages (src/libs/crypto/thread-encryption.ts) — that's a
// separate, larger, more security-sensitive subsystem deliberately
// deferred to its own future slice. See
// docs/adrs/21-monorepo-and-api-decoupling.md.

const SECRET_KEY = process.env.SECRET_KEY!;

export function encryptApiKey(apiKey: string): string {
  return AES.encrypt(apiKey, SECRET_KEY).toString();
}

export function decryptApiKey(encryptedApiKey: string): string {
  const bytes = AES.decrypt(encryptedApiKey, SECRET_KEY);
  return bytes.toString(enc.Utf8);
}

export const maskApiKey = (apiKey: string): string => {
  if (apiKey.length <= 8) {
    return apiKey;
  }
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
};
