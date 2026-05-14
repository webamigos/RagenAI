import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockStoreToken = vi.fn();
const mockTrackAudit = vi.fn();
const mockIsFeatureEnabled = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    apiKey: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({
    isFeatureEnabledQuery: (...args: unknown[]) =>
      mockIsFeatureEnabled(...args),
  }),
);

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
    mockIsFeatureEnabled.mockResolvedValue(true);
  });

  it('rejects when apiAccess feature is disabled for the org', async () => {
    mockIsFeatureEnabled.mockResolvedValue(false);

    await expect(
      createApiKeyCommand({
        orgId: 'org-1',
        userId: 'user-1',
        name: 'k',
      }),
    ).rejects.toThrow(/API access is not enabled/);

    expect(mockCreate).not.toHaveBeenCalled();
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

  it('generates opaque key in sk-keyId.secret format', async () => {
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

    // Key format: sk-<keyId>.<secret>
    expect(result.fullKey).toMatch(/^sk-/);

    const withoutPrefix = result.fullKey.slice(3);
    const dotIndex = withoutPrefix.indexOf('.');
    expect(dotIndex).toBeGreaterThan(0);

    const parsedKeyId = withoutPrefix.slice(0, dotIndex);
    const secret = withoutPrefix.slice(dotIndex + 1);

    expect(parsedKeyId).toBe(keyId);
    expect(secret.length).toBeGreaterThan(0);

    // Key should NOT contain embedded orgId, userId, projectId
    expect(result.fullKey).not.toContain('org-1');
    expect(result.fullKey).not.toContain('user-1');
    expect(result.fullKey).not.toContain('proj-1');
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
