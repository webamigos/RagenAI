import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpsert = vi.fn();
const mockRequireAccess = vi.fn().mockResolvedValue({
  orgId: 'org-1',
  userId: 'user-1',
});

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../../utils/require-project-access', () => ({
  requireProjectAccess: (...args: unknown[]) => mockRequireAccess(...args),
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    projectSettings: { upsert: (...args: unknown[]) => mockUpsert(...args) },
  },
}));

import { markIntegrationsPromptedCommand } from '../mark-integrations-prompted-command';

describe('markIntegrationsPromptedCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({});
  });

  it('upserts the timestamp under manage scope', async () => {
    const result = await markIntegrationsPromptedCommand('proj-1');

    expect(result).toEqual({ success: true });
    expect(mockRequireAccess).toHaveBeenCalledWith('proj-1', 'manage');

    const call = mockUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ projectId: 'proj-1' });
    expect(call.update.integrationsPromptedAt).toBeInstanceOf(Date);
    expect(call.create.projectId).toBe('proj-1');
    expect(call.create.integrationsPromptedAt).toBeInstanceOf(Date);
  });
});
