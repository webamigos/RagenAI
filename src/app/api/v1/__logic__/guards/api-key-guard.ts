import { timingSafeEqual } from 'node:crypto';
import { type NextRequest } from 'next/server';
import db from '@ragenai/prisma-client';
import { getRagenAuthClient } from '@/libs/ragen-vault/client';
import { logger } from '@/app/lib/utils/logger';

const VAULT_PROVIDER = 'ragen-api-key';
const KEY_PREFIX = 'sk-';

export type ApiKeyContext = {
  orgId: string;
  userId: string;
  projectId: string;
  keyId: string;
};

function extractDataFromApiKey(apiKey: string): ApiKeyContext {
  if (!apiKey.startsWith(KEY_PREFIX)) {
    throw new Error('Invalid API key format');
  }

  const plainKey = apiKey.slice(KEY_PREFIX.length);
  const parts = Buffer.from(plainKey, 'base64url').toString('ascii').split(' ');

  if (parts.length < 5) {
    throw new Error('Invalid API key format');
  }

  const [, orgId, userId, projectId, keyId] = parts;

  if (!orgId || !userId || !projectId || !keyId) {
    throw new Error('Invalid API key format');
  }

  return { orgId, userId, projectId, keyId };
}

export async function apiKeyGuard(
  request: NextRequest,
): Promise<ApiKeyContext> {
  const apiKey = request.headers.get('x-api-key');

  if (!apiKey) {
    throw new ApiKeyError('Missing x-api-key header', 401);
  }

  let context: ApiKeyContext;
  try {
    context = extractDataFromApiKey(apiKey);
  } catch {
    throw new ApiKeyError('Invalid API key format', 401);
  }

  // Check DB record exists and is active
  const dbKey = await db.apiKey.findUnique({
    where: { id: context.keyId },
    select: { isActive: true, organizationId: true },
  });

  if (!dbKey || dbKey.organizationId !== context.orgId) {
    throw new ApiKeyError('Invalid API key', 401);
  }

  if (!dbKey.isActive) {
    throw new ApiKeyError('API key is deactivated', 403);
  }

  // Validate against vault (timing-safe comparison)
  let stored: { accessToken: string };
  try {
    stored = await getRagenAuthClient().getToken(
      `api-key-${context.keyId}`,
      VAULT_PROVIDER,
    );
  } catch {
    throw new ApiKeyError('Invalid API key', 401);
  }

  const apiKeyBuf = Buffer.from(apiKey);
  const storedBuf = Buffer.from(stored.accessToken);

  if (
    apiKeyBuf.length !== storedBuf.length ||
    !timingSafeEqual(apiKeyBuf, storedBuf)
  ) {
    throw new ApiKeyError('Invalid API key', 401);
  }

  // Fire-and-forget: update lastUsedAt
  db.apiKey
    .update({
      where: { id: context.keyId },
      data: { lastUsedAt: new Date() },
    })
    .catch((error) => {
      logger.error({ err: error }, 'Failed to update API key lastUsedAt');
    });

  return context;
}

export class ApiKeyError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'ApiKeyError';
  }
}
