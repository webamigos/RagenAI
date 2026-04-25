import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockCreateLiteLLMTeam = vi.fn();
const mockGetLiteLLMTeamInfo = vi.fn();
const mockGenerateLiteLLMKey = vi.fn();
const mockDeleteLiteLLMTeam = vi.fn();
const mockDeleteLiteLLMKey = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    team: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock('@/libs/litellm/client', () => ({
  createLiteLLMTeam: (...args: unknown[]) => mockCreateLiteLLMTeam(...args),
  getLiteLLMTeamInfo: (...args: unknown[]) => mockGetLiteLLMTeamInfo(...args),
  generateLiteLLMKey: (...args: unknown[]) => mockGenerateLiteLLMKey(...args),
  deleteLiteLLMTeam: (...args: unknown[]) => mockDeleteLiteLLMTeam(...args),
  deleteLiteLLMKey: (...args: unknown[]) => mockDeleteLiteLLMKey(...args),
}));

vi.mock('@/app/lib/utils/hashApiKey', () => ({
  encryptApiKey: (v: string) => `enc:${v}`,
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { provisionLiteLLMForTeamCommand } from '../provision-litellm-team-command';

const baseTeam = {
  id: 'team-1',
  name: 'Legal',
  organizationId: 'org-1',
  organization: { name: 'Acme', slug: 'acme' },
  budgetUsdCents: 2500,
  budgetDuration: '30d',
  allowedModels: [] as string[],
  tpmLimit: null,
  rpmLimit: null,
  litellmTeamId: null,
  litellmKeyToken: null,
};

describe('provisionLiteLLMForTeamCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetLiteLLMTeamInfo.mockResolvedValue(null);
    mockCreateLiteLLMTeam.mockResolvedValue({ team_id: 'team-1' });
    mockGenerateLiteLLMKey.mockResolvedValue({
      key: 'sk-key-1',
      token: 'tok-1',
      key_alias: 'ragen-team-team-1',
      team_id: 'team-1',
      max_budget: 25,
      spend: 0,
      models: [],
    });
    mockUpdate.mockResolvedValue({});
    mockDeleteLiteLLMTeam.mockResolvedValue(undefined);
    mockDeleteLiteLLMKey.mockResolvedValue(undefined);
  });

  it('provisions a LiteLLM team and persists the encrypted key', async () => {
    mockFindUnique.mockResolvedValue({ ...baseTeam });

    await provisionLiteLLMForTeamCommand({ teamId: 'team-1' });

    expect(mockCreateLiteLLMTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        teamAlias: 'acme:Legal',
        maxBudget: 25,
        budgetDuration: '30d',
      }),
    );
    expect(mockGenerateLiteLLMKey).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        keyAlias: 'ragen-team-team-1',
      }),
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: {
        litellmTeamId: 'team-1',
        litellmKeyToken: 'enc:sk-key-1',
      },
    });
  });

  it('is a no-op when the team already has a LiteLLM id and key', async () => {
    mockFindUnique.mockResolvedValue({
      ...baseTeam,
      litellmTeamId: 'team-1',
      litellmKeyToken: 'enc:sk-key-1',
    });

    await provisionLiteLLMForTeamCommand({ teamId: 'team-1' });

    expect(mockCreateLiteLLMTeam).not.toHaveBeenCalled();
    expect(mockGenerateLiteLLMKey).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('skips create when the LiteLLM team already exists remotely', async () => {
    mockFindUnique.mockResolvedValue({ ...baseTeam });
    mockGetLiteLLMTeamInfo.mockResolvedValue({ team_id: 'team-1' });

    await provisionLiteLLMForTeamCommand({ teamId: 'team-1' });

    expect(mockCreateLiteLLMTeam).not.toHaveBeenCalled();
    expect(mockGenerateLiteLLMKey).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('rolls back the LiteLLM team when key generation fails', async () => {
    mockFindUnique.mockResolvedValue({ ...baseTeam });
    mockGenerateLiteLLMKey.mockRejectedValue(
      new Error('Failed: 400 bad input'),
    );

    await expect(
      provisionLiteLLMForTeamCommand({ teamId: 'team-1' }),
    ).rejects.toThrow(/400/);

    expect(mockDeleteLiteLLMTeam).toHaveBeenCalledWith('team-1');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not roll back an already-existing remote team on key failure', async () => {
    mockFindUnique.mockResolvedValue({ ...baseTeam });
    mockGetLiteLLMTeamInfo.mockResolvedValue({ team_id: 'team-1' });
    mockGenerateLiteLLMKey.mockRejectedValue(
      new Error('Failed: 400 bad input'),
    );

    await expect(
      provisionLiteLLMForTeamCommand({ teamId: 'team-1' }),
    ).rejects.toThrow(/400/);

    expect(mockDeleteLiteLLMTeam).not.toHaveBeenCalled();
  });

  it('revokes the key if persisting to the DB fails', async () => {
    mockFindUnique.mockResolvedValue({ ...baseTeam });
    mockUpdate.mockRejectedValue(new Error('db exploded'));

    await expect(
      provisionLiteLLMForTeamCommand({ teamId: 'team-1' }),
    ).rejects.toThrow(/db exploded/);

    expect(mockDeleteLiteLLMKey).toHaveBeenCalledWith('tok-1');
  });

  it('throws when the team row is missing', async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(
      provisionLiteLLMForTeamCommand({ teamId: 'missing' }),
    ).rejects.toThrow(/Team not found/);
  });

  it('passes allowedModels + limits when the team has them configured', async () => {
    mockFindUnique.mockResolvedValue({
      ...baseTeam,
      allowedModels: ['claude-haiku-4-5'],
      tpmLimit: 100_000,
      rpmLimit: 60,
    });

    await provisionLiteLLMForTeamCommand({ teamId: 'team-1' });

    expect(mockCreateLiteLLMTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        models: ['claude-haiku-4-5'],
        tpmLimit: 100_000,
        rpmLimit: 60,
      }),
    );
  });
});
