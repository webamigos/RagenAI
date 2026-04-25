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

  it('syncs budget + models + limits to LiteLLM', async () => {
    mockFindUnique.mockResolvedValue(baseTeam);

    await updateLiteLLMForTeamCommand({ teamId: 'team-1' });

    expect(mockUpdateLiteLLMTeam).toHaveBeenCalledWith({
      teamId: 'team-1',
      maxBudget: 50,
      budgetDuration: '30d',
      models: ['gpt-5.4'],
      tpmLimit: null,
      rpmLimit: null,
    });
    expect(mockProvision).not.toHaveBeenCalled();
  });

  it('passes an empty models array to clear the whitelist when no models are set', async () => {
    mockFindUnique.mockResolvedValue({ ...baseTeam, allowedModels: [] });

    await updateLiteLLMForTeamCommand({ teamId: 'team-1' });

    expect(mockUpdateLiteLLMTeam).toHaveBeenCalledWith(
      expect.objectContaining({ models: [] }),
    );
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
