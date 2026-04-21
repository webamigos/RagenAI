import { createHmac, timingSafeEqual } from 'crypto';
import { isDevelopment, isTestTargetEnv } from '@/libs/utils/env';

function getSecret(): string {
  const secret = process.env.PUBLIC_LINK_TOKEN_SECRET;
  if (!secret && !isDevelopment && !isTestTargetEnv) {
    throw new Error(
      'PUBLIC_LINK_TOKEN_SECRET env var is required in non-development environments',
    );
  }
  return secret ?? 'dev-fallback-secret';
}
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function generatePublicLinkToken(publicId: string): string {
  const timestamp = Date.now().toString();
  const payload = `${publicId}:${timestamp}`;
  const signature = createHmac('sha256', getSecret())
    .update(payload)
    .digest('hex');
  return `${timestamp}.${signature}`;
}

export function verifyPublicLinkToken(
  publicId: string,
  token: string,
): boolean {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) {
    return false;
  }

  const timestamp = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const age = Date.now() - parseInt(timestamp, 10);
  if (isNaN(age) || age < 0 || age > TOKEN_TTL_MS) {
    return false;
  }

  const payload = `${publicId}:${timestamp}`;
  const expected = createHmac('sha256', getSecret())
    .update(payload)
    .digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}
