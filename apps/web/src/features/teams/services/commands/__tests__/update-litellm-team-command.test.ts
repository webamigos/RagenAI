import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockUpdateLiteLLMTeam = vi.fn();
const mockProvision = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    team: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock('@/libs/litellm/client', () => ({
  updateLiteLLMTeam: (...args: unknown[]) => mockUpdateLiteLLMTeam(...args),
}));

vi.mock('../provision-litellm-team-command', () => ({
  provisionLiteLLMForTeamCommand: (...args: unknown[]) =>
    mockProvision(...args),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { updateLiteLLMForTeamCommand } from '../update-litellm-team-command';

const baseTeam = {
  id: 'team-1',
  name: 'Legal',
  organizationId: 'org-1',
  budgetUsdCents: 5000,
  budgetDuration: '30d',
  allowedModels: ['gpt-5.4'],
  tpmLimit: null,
  rpmLimit: null,
  litellmTeamId: 'team-1',
  litellmKeyToken: 'enc:sk-key-1',
};

describe('updateLiteLLMForTeamCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateLiteLLMTeam.mockResolvedValue({ team_id: 'team-1' });
  });

  /**
   * Rate limits only. The budget and the model allowlist are enforced by the
   * application — `assertWithinUsageLimits` before every turn, and
   * `getAvailableModelsForOrganization` for the list — so a copy at the proxy
   * could only ever be the stale one, which is what the admin panel had a
   * whole page to detect.
   */
  it('syncs the rate limits, and nothing the application owns', async () => {
    mockFindUnique.mockResolvedValue({
      ...baseTeam,
      tpmLimit: 1000,
      rpmLimit: 60,
    });

    await updateLiteLLMForTeamCommand({ teamId: 'team-1' });

    expect(mockUpdateLiteLLMTeam).toHaveBeenCalledWith({
      teamId: 'team-1',
      tpmLimit: 1000,
      rpmLimit: 60,
    });
    expect(mockProvision).not.toHaveBeenCalled();
  });

  it('sends no budget and no allowlist, even when the team has both', async () => {
    mockFindUnique.mockResolvedValue(baseTeam);

    await updateLiteLLMForTeamCommand({ teamId: 'team-1' });

    const [sent] = mockUpdateLiteLLMTeam.mock.calls[0];
    expect(sent.maxBudget).toBeUndefined();
    expect(sent.budgetDuration).toBeUndefined();
    expect(sent.models).toBeUndefined();
  });

  it('lazily provisions when the team has no LiteLLM counterpart yet', async () => {
    mockFindUnique.mockResolvedValue({
      ...baseTeam,
      litellmTeamId: null,
      litellmKeyToken: null,
    });

    await updateLiteLLMForTeamCommand({ teamId: 'team-1' });

    expect(mockProvision).toHaveBeenCalledWith({ teamId: 'team-1' });
    expect(mockUpdateLiteLLMTeam).not.toHaveBeenCalled();
  });

  it('throws when the team is missing', async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(
      updateLiteLLMForTeamCommand({ teamId: 'missing' }),
    ).rejects.toThrow(/Team not found/);
  });
});
