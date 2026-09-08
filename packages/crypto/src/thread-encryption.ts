import { encryptContent, decryptContent } from './envelope';
import { getKeyProvider, isEncryptionConfigured } from './key-provider';

/** Whether envelope encryption is available in this process. */
export function isEncryptionEnabled(): boolean {
  return isEncryptionConfigured();
}

/**
 * Generate a DEK for a thread. The wrapped form is stored on the row; the
 * plaintext is used immediately and never persisted.
 */
export async function generateThreadKey(): Promise<{
  encryptedDek: string;
  plaintextDek: Buffer;
}> {
  return getKeyProvider().generateDataKey();
}

/**
 * Unwrapped DEKs, cached by their wrapped form.
 *
 * Rendering a thread decrypts every message with the same key, so without
 * this each message would be a KMS round trip. The cache is process-wide and
 * unbounded, which is why `clearDekCache()` exists and why a long-lived
 * process should call it — the entries are plaintext key material.
 */
const dekCache = new Map<string, Buffer>();

export async function decryptThreadKey(
  encryptedDekBase64: string,
): Promise<Buffer> {
  const cached = dekCache.get(encryptedDekBase64);
  if (cached) {
    return cached;
  }

  const plaintext = await getKeyProvider().decryptDataKey(encryptedDekBase64);
  dekCache.set(encryptedDekBase64, plaintext);
  return plaintext;
}

/** Drop every cached DEK. Call at the end of request processing. */
export function clearDekCache(): void {
  dekCache.clear();
}

/**
 * Encrypt several message bodies under one thread key, generating the key if
 * the thread does not have one yet.
 */
export async function encryptMessages(
  messages: { content: string }[],
  existingEncryptedDek?: string,
): Promise<{ encryptedContents: string[]; encryptedDek: string }> {
  let dek: Buffer;
  let encryptedDek: string;

  if (existingEncryptedDek) {
    dek = await decryptThreadKey(existingEncryptedDek);
    encryptedDek = existingEncryptedDek;
  } else {
    const key = await generateThreadKey();
    dek = key.plaintextDek;
    encryptedDek = key.encryptedDek;
  }

  return {
    encryptedContents: messages.map((msg) => encryptContent(msg.content, dek)),
    encryptedDek,
  };
}

/** Decrypt several message bodies under one thread key. */
export async function decryptMessages(
  encryptedContents: string[],
  encryptedDek: string,
): Promise<string[]> {
  const dek = await decryptThreadKey(encryptedDek);
  return encryptedContents.map((content) => decryptContent(content, dek));
}

/**
 * Decrypt the bodies of a thread's messages in place.
 *
 * Decryption is attempted whenever a DEK is present, regardless of whether
 * encryption is currently *enabled* — turning the feature off must not make
 * existing conversations unreadable.
 */
export async function decryptMessageContents<T extends { content: string }>(
  messages: T[],
  encryptedDek: string | null | undefined,
): Promise<T[]> {
  if (!encryptedDek || messages.length === 0) {
    return messages;
  }

  const dek = await decryptThreadKey(encryptedDek);

  return messages.map((msg) => ({
    ...msg,
    content: decryptContent(msg.content, dek),
  }));
}

/** Decrypt a document body, or return it unchanged when it has no DEK. */
export async function decryptDocumentContent(
  content: string,
  encryptedDek: string | null | undefined,
): Promise<string> {
  if (!encryptedDek) {
    return content;
  }

  const dek = await decryptThreadKey(encryptedDek);
  return decryptContent(content, dek);
}
