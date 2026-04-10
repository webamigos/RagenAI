import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type NextRequest } from 'next/server';

const mockFindUnique = vi.fn();
const mockUpdateApiKey = vi.fn();
const mockGetToken = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    apiKey: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdateApiKey(...args),
    },
  },
}));

vi.mock('@/libs/ragen-vault/client', () => ({
  getRagenAuthClient: () => ({
    getToken: (...args: unknown[]) => mockGetToken(...args),
  }),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

import { apiKeyGuard, ApiKeyError } from '../api-key-guard';

function generateTestKey(
  orgId: string,
  userId: string,
  projectId: string,
  keyId: string,
): string {
  const randomPart = 'a'.repeat(43); // fake random
  const content = `${randomPart} ${orgId} ${userId} ${projectId} ${keyId}`;
  return `sk-${Buffer.from(content).toString('base64url')}`;
}

function createMockRequest(headers: Record<string, string> = {}): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name] ?? null,
    },
  } as unknown as NextRequest;
}

describe('apiKeyGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateApiKey.mockResolvedValue({});
  });

  it('throws 401 when x-api-key header is missing', async () => {
    const req = createMockRequest();

    await expect(apiKeyGuard(req)).rejects.toThrow(ApiKeyError);
    await expect(apiKeyGuard(req)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Missing x-api-key header',
    });
  });

  it('throws 401 for invalid key format', async () => {
    const req = createMockRequest({ 'x-api-key': 'invalid-key' });

    await expect(apiKeyGuard(req)).rejects.toThrow(ApiKeyError);
    await expect(apiKeyGuard(req)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('throws 401 when key not found in DB', async () => {
    const apiKey = generateTestKey('org-1', 'user-1', 'proj-1', 'key-1');
    const req = createMockRequest({ 'x-api-key': apiKey });
    mockFindUnique.mockResolvedValue(null);

    await expect(apiKeyGuard(req)).rejects.toThrow(ApiKeyError);
    await expect(apiKeyGuard(req)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid API key',
    });
  });

  it('throws 403 when key is deactivated', async () => {
    const apiKey = generateTestKey('org-1', 'user-1', 'proj-1', 'key-1');
    const req = createMockRequest({ 'x-api-key': apiKey });
    mockFindUnique.mockResolvedValue({
      isActive: false,
      organizationId: 'org-1',
    });

    await expect(apiKeyGuard(req)).rejects.toThrow(ApiKeyError);
    await expect(apiKeyGuard(req)).rejects.toMatchObject({
      statusCode: 403,
      message: 'API key is deactivated',
    });
  });

  it('throws 401 when vault key does not match', async () => {
    const apiKey = generateTestKey('org-1', 'user-1', 'proj-1', 'key-1');
    const req = createMockRequest({ 'x-api-key': apiKey });
    mockFindUnique.mockResolvedValue({
      isActive: true,
      organizationId: 'org-1',
    });
    mockGetToken.mockResolvedValue({
      accessToken: 'sk-completely-different-key',
    });

    await expect(apiKeyGuard(req)).rejects.toThrow(ApiKeyError);
    await expect(apiKeyGuard(req)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('returns context when key is valid', async () => {
    const apiKey = generateTestKey('org-1', 'user-1', 'proj-1', 'key-1');
    const req = createMockRequest({ 'x-api-key': apiKey });
    mockFindUnique.mockResolvedValue({
      isActive: true,
      organizationId: 'org-1',
    });
    mockGetToken.mockResolvedValue({ accessToken: apiKey });

    const context = await apiKeyGuard(req);

    expect(context).toEqual({
      orgId: 'org-1',
      userId: 'user-1',
      projectId: 'proj-1',
      keyId: 'key-1',
    });
  });

  it('updates lastUsedAt after successful validation', async () => {
    const apiKey = generateTestKey('org-1', 'user-1', 'proj-1', 'key-1');
    const req = createMockRequest({ 'x-api-key': apiKey });
    mockFindUnique.mockResolvedValue({
      isActive: true,
      organizationId: 'org-1',
    });
    mockGetToken.mockResolvedValue({ accessToken: apiKey });

    await apiKeyGuard(req);

    // Wait for the fire-and-forget to execute
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockUpdateApiKey).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('throws 401 when org does not match', async () => {
    const apiKey = generateTestKey('org-1', 'user-1', 'proj-1', 'key-1');
    const req = createMockRequest({ 'x-api-key': apiKey });
    mockFindUnique.mockResolvedValue({
      isActive: true,
      organizationId: 'org-different',
    });

    await expect(apiKeyGuard(req)).rejects.toThrow(ApiKeyError);
    await expect(apiKeyGuard(req)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid API key',
    });
  });
});
