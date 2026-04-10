import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockStoreToken = vi.fn();
const mockTrackAudit = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    apiKey: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

vi.mock('@/libs/ragen-vault/client', () => ({
  getRagenAuthClient: () => ({
    storeToken: mockStoreToken,
  }),
}));

vi.mock(
  '@/features/audit-logs/services/commands/create-audit-log-command',
  () => ({
    trackAudit: (...args: unknown[]) => mockTrackAudit(...args),
  }),
);

vi.mock('@/app/lib/utils/hashApiKey', () => ({
  maskApiKey: (key: string) => `${key.slice(0, 4)}...${key.slice(-4)}`,
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

import { createApiKeyCommand } from '../create-api-key-command';

describe('createApiKeyCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an API key with correct flow', async () => {
    const keyId = '550e8400-e29b-41d4-a716-446655440000';
    mockCreate.mockResolvedValue({ id: keyId });
    mockUpdate.mockResolvedValue({});
    mockStoreToken.mockResolvedValue(undefined);

    const result = await createApiKeyCommand({
      orgId: 'org-1',
      userId: 'user-1',
      name: 'Test Key',
      projectId: 'proj-1',
    });

    // DB record created first
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Test Key',
        maskedValue: '',
        organizationId: 'org-1',
        projectId: 'proj-1',
        createdBy: 'user-1',
      }),
    });

    // Full key stored in vault
    expect(mockStoreToken).toHaveBeenCalledWith(
      `api-key-${keyId}`,
      'ragen-api-key',
      expect.objectContaining({
        accessToken: expect.stringContaining('sk-'),
      }),
    );

    // Masked value updated in DB
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: keyId },
      data: { maskedValue: expect.any(String) },
    });

    // Audit logged
    expect(mockTrackAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'api-key.created',
        entityType: 'api-key',
        entityId: keyId,
      }),
    );

    // Returns full key (shown once)
    expect(result.fullKey).toMatch(/^sk-/);
    expect(result.id).toBe(keyId);
    expect(result.name).toBe('Test Key');
  });

  it('generates key in correct format', async () => {
    const keyId = 'key-uuid-123';
    mockCreate.mockResolvedValue({ id: keyId });
    mockUpdate.mockResolvedValue({});
    mockStoreToken.mockResolvedValue(undefined);

    const result = await createApiKeyCommand({
      orgId: 'org-1',
      userId: 'user-1',
      name: 'Test',
      projectId: 'proj-1',
    });

    // Key should start with sk- prefix
    expect(result.fullKey).toMatch(/^sk-/);

    // Decode the key to verify structure
    const plainKey = result.fullKey.slice(3); // remove 'sk-'
    const decoded = Buffer.from(plainKey, 'base64url').toString('ascii');
    const parts = decoded.split(' ');

    expect(parts).toHaveLength(5);
    expect(parts[1]).toBe('org-1');
    expect(parts[2]).toBe('user-1');
    expect(parts[3]).toBe('proj-1');
    expect(parts[4]).toBe(keyId);
  });

  it('cleans up DB record if vault write fails', async () => {
    const keyId = 'key-uuid-456';
    mockCreate.mockResolvedValue({ id: keyId });
    mockStoreToken.mockRejectedValue(new Error('vault unavailable'));
    mockDelete.mockResolvedValue({});

    await expect(
      createApiKeyCommand({
        orgId: 'org-1',
        userId: 'user-1',
        name: 'Test',
        projectId: 'proj-1',
      }),
    ).rejects.toThrow('vault unavailable');

    expect(mockDelete).toHaveBeenCalledWith({
      where: { id: keyId },
    });
  });
});
