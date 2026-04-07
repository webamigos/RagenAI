import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from '@aws-sdk/client-kms';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let kmsClient: KMSClient | null = null;

function getKmsClient(): KMSClient {
  if (!kmsClient) {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error(
        'AWS credentials not configured: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required',
      );
    }
    kmsClient = new KMSClient({
      region: process.env.AWS_DEFAULT_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return kmsClient;
}

function getKmsKeyId(): string {
  const keyId = process.env.AWS_KMS_KEY_ID;
  if (!keyId) {
    throw new Error('AWS_KMS_KEY_ID is not configured');
  }
  return keyId;
}

export function isEncryptionEnabled(): boolean {
  return !!process.env.AWS_KMS_KEY_ID;
}

/**
 * Generate a new data encryption key (DEK) for a thread via KMS envelope encryption.
 * Returns the encrypted DEK (base64) to store in DB and the plaintext DEK for immediate use.
 */
export async function generateThreadKey(): Promise<{
  encryptedDek: string;
  plaintextDek: Buffer;
}> {
  const command = new GenerateDataKeyCommand({
    KeyId: getKmsKeyId(),
    KeySpec: 'AES_256',
  });

  const response = await getKmsClient().send(command);

  if (!response.Plaintext || !response.CiphertextBlob) {
    throw new Error('KMS GenerateDataKey returned incomplete response');
  }

  return {
    encryptedDek: Buffer.from(response.CiphertextBlob).toString('base64'),
    plaintextDek: Buffer.from(response.Plaintext),
  };
}

/**
 * Decrypt a KMS-encrypted DEK back to plaintext.
 * Cache the result per-request to avoid repeated KMS calls for the same thread.
 */
const dekCache = new Map<string, Buffer>();

export async function decryptThreadKey(
  encryptedDekBase64: string,
): Promise<Buffer> {
  const cached = dekCache.get(encryptedDekBase64);
  if (cached) {
    return cached;
  }

  const command = new DecryptCommand({
    CiphertextBlob: Buffer.from(encryptedDekBase64, 'base64'),
  });

  const response = await getKmsClient().send(command);

  if (!response.Plaintext) {
    throw new Error('KMS Decrypt returned empty plaintext');
  }

  const plaintext = Buffer.from(response.Plaintext);
  dekCache.set(encryptedDekBase64, plaintext);
  return plaintext;
}

/**
 * Clear the DEK cache. Call this at the end of request processing.
 */
export function clearDekCache(): void {
  dekCache.clear();
}

/**
 * Encrypt message content using a plaintext DEK.
 * Returns a base64 string containing: IV + ciphertext + auth tag.
 */
export function encryptContent(plaintext: string, dek: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, dek, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: IV (12) + ciphertext (variable) + authTag (16)
  const packed = Buffer.concat([iv, encrypted, authTag]);
  return packed.toString('base64');
}

/**
 * Decrypt message content using a plaintext DEK.
 * Expects base64 string containing: IV + ciphertext + auth tag.
 */
export function decryptContent(encryptedBase64: string, dek: Buffer): string {
  const packed = Buffer.from(encryptedBase64, 'base64');

  const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
  if (packed.length < minLength) {
    throw new Error(
      `Invalid encrypted payload: expected at least ${minLength} bytes, got ${packed.length}`,
    );
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(
    IV_LENGTH,
    packed.length - AUTH_TAG_LENGTH,
  );

  const decipher = createDecipheriv(ALGORITHM, dek, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Encrypt multiple message contents for a thread.
 * Generates a new DEK if not provided — returns the encrypted DEK to store.
 */
export async function encryptMessages(
  messages: { content: string }[],
  existingEncryptedDek?: string,
): Promise<{
  encryptedContents: string[];
  encryptedDek: string;
}> {
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

  const encryptedContents = messages.map((msg) =>
    encryptContent(msg.content, dek),
  );

  return { encryptedContents, encryptedDek };
}

/**
 * Decrypt multiple message contents for a thread.
 */
export async function decryptMessages(
  encryptedContents: string[],
  encryptedDek: string,
): Promise<string[]> {
  const dek = await decryptThreadKey(encryptedDek);
  return encryptedContents.map((content) => decryptContent(content, dek));
}
