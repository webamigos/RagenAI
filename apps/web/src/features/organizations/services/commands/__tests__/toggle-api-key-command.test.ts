import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdate = vi.fn();
const mockTrackAudit = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    apiKey: {
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock(
  '@/features/audit-logs/services/commands/create-audit-log-command',
  () => ({
    trackAudit: (...args: unknown[]) => mockTrackAudit(...args),
  }),
);

import { toggleApiKeyCommand } from '../toggle-api-key-command';

describe('toggleApiKeyCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deactivates an API key', async () => {
    mockUpdate.mockResolvedValue({ id: 'key-1', isActive: false });

    await toggleApiKeyCommand('org-1', 'key-1', false);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'key-1', organizationId: 'org-1' },
      data: { isActive: false },
    });

    expect(mockTrackAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'api-key.deactivated',
        entityType: 'api-key',
        entityId: 'key-1',
      }),
    );
  });

  it('activates an API key', async () => {
    mockUpdate.mockResolvedValue({ id: 'key-1', isActive: true });

    await toggleApiKeyCommand('org-1', 'key-1', true);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'key-1', organizationId: 'org-1' },
      data: { isActive: true },
    });

    expect(mockTrackAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'api-key.activated',
      }),
    );
  });
});
