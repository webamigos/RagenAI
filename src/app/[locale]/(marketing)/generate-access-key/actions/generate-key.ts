'use server';

import { logger } from '@/app/lib/utils/logger';
import crypto from 'crypto';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ORGANIZATION_KEY_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('Encryption key not configured');
  }
  return Buffer.from(key, 'hex');
}

export const generateKey = async (organizationId: string) => {
  // console.log({ organizationId });
  try {
    logger.info('Generating encrypted key for organization');

    // Generate a random IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

    // Encrypt the organization ID
    const encrypted = Buffer.concat([
      cipher.update(organizationId, 'utf8'),
      cipher.final(),
    ]);

    // Get auth tag
    const authTag = cipher.getAuthTag();

    // Combine IV + encrypted data + auth tag
    const combined = Buffer.concat([iv, encrypted, authTag]);

    // Convert to URL-safe base64
    return combined.toString('base64url');
  } catch (error) {
    logger.error({ err: error }, 'Error generating key:');
    throw new Error('Failed to generate access key');
  }
};

export const decodeKey = async (encodedKey: string): Promise<string> => {
  try {
    // Convert from base64url to buffer
    const combined = Buffer.from(encodedKey, 'base64url');

    // Extract IV, encrypted data, and auth tag
    const iv = combined.subarray(0, IV_LENGTH);
    const encrypted = combined.subarray(
      IV_LENGTH,
      combined.length - AUTH_TAG_LENGTH
    );
    const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    logger.error('Error decoding key:', error);
    throw new Error('Invalid access key');
  }
};
