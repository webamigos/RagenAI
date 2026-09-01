import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUniqueOrThrow = vi.fn();
const mockDelete = vi.fn();
const mockDeleteToken = vi.fn();
const mockTrackAudit = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    apiKey: {
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrow(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

vi.mock('@/libs/ragen-vault/client', () => ({
  getRagenAuthClient: () => ({
    deleteToken: (...args: unknown[]) => mockDeleteToken(...args),
  }),
}));

vi.mock(
  '@/features/audit-logs/services/commands/create-audit-log-command',
  () => ({
    trackAudit: (...args: unknown[]) => mockTrackAudit(...args),
  }),
);

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

import { removeApiKeyCommand } from '../remove-api-key-command';

describe('removeApiKeyCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes API key from DB and vault', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ id: 'key-1', name: 'Test Key' });
    mockDelete.mockResolvedValue({ id: 'key-1' });
    mockDeleteToken.mockResolvedValue(undefined);

    await removeApiKeyCommand('org-1', 'key-1');

    expect(mockFindUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'key-1', organizationId: 'org-1' },
    });

    expect(mockDelete).toHaveBeenCalledWith({
      where: { id: 'key-1' },
    });

    expect(mockDeleteToken).toHaveBeenCalledWith(
      'api-key-key-1',
      'ragen-api-key',
    );

    expect(mockTrackAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'api-key.deleted',
        entityType: 'api-key',
        entityId: 'key-1',
        oldData: { name: 'Test Key' },
      }),
    );
  });

  it('does not fail if vault deletion fails', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ id: 'key-1', name: 'Test' });
    mockDelete.mockResolvedValue({ id: 'key-1' });
    mockDeleteToken.mockRejectedValue(new Error('vault error'));

    // Should not throw
    const result = await removeApiKeyCommand('org-1', 'key-1');
    expect(result).toEqual({ id: 'key-1' });
  });
});
