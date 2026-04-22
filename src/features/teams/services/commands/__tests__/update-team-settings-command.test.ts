import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateLiteLLM = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    team: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock('../update-litellm-team-command', () => ({
  updateLiteLLMForTeamCommand: (...args: unknown[]) =>
    mockUpdateLiteLLM(...args),
}));

import { updateTeamSettingsCommand } from '../update-team-settings-command';

const updatedTeamRow = {
  id: 'team-1',
  name: 'Legal',
  organizationId: 'org-1',
  budgetUsdCents: 5000,
  budgetDuration: '30d',
  rpmLimit: 60,
  tpmLimit: 100_000,
  allowedModels: ['gpt-5.4'],
  litellmTeamId: 'team-1',
  litellmKeyToken: 'enc:key',
};

describe('updateTeamSettingsCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFindFirst.mockResolvedValue({ id: 'team-1' });
    mockUpdate.mockResolvedValue(updatedTeamRow);
    mockUpdateLiteLLM.mockResolvedValue(undefined);
  });

  it('updates Prisma and triggers the LiteLLM sync', async () => {
    const result = await updateTeamSettingsCommand('team-1', 'org-1', {
      name: 'Legal',
      budgetUsdCents: 5000,
      budgetDuration: '30d',
      rpmLimit: 60,
      tpmLimit: 100_000,
      allowedModels: ['gpt-5.4'],
    });

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: 'team-1', organizationId: 'org-1' },
      select: { id: true },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: {
        name: 'Legal',
        budgetUsdCents: 5000,
        budgetDuration: '30d',
        rpmLimit: 60,
        tpmLimit: 100_000,
        allowedModels: ['gpt-5.4'],
      },
    });
    expect(mockUpdateLiteLLM).toHaveBeenCalledWith({ teamId: 'team-1' });
    expect(result.litellmProvisioned).toBe(true);
  });

  it('throws NotFoundException when the team is not in the caller org', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      updateTeamSettingsCommand('team-1', 'other-org', {
        budgetUsdCents: 100,
      }),
    ).rejects.toThrow(/Team not found/);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockUpdateLiteLLM).not.toHaveBeenCalled();
  });

  it('rejects invalid budgetDuration before touching the DB', async () => {
    await expect(
      updateTeamSettingsCommand('team-1', 'org-1', {
        budgetDuration: '15d',
      }),
    ).rejects.toThrow(/budgetDuration/);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it('rejects negative budget', async () => {
    await expect(
      updateTeamSettingsCommand('team-1', 'org-1', {
        budgetUsdCents: -1,
      }),
    ).rejects.toThrow(/non-negative/);
  });

  it('passes undefined fields through as no-op (partial update)', async () => {
    await updateTeamSettingsCommand('team-1', 'org-1', {
      budgetUsdCents: 2500,
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { budgetUsdCents: 2500 },
    });
  });

  it('marks litellmProvisioned false when ids are missing after update', async () => {
    mockUpdate.mockResolvedValue({
      ...updatedTeamRow,
      litellmTeamId: null,
      litellmKeyToken: null,
    });

    const result = await updateTeamSettingsCommand('team-1', 'org-1', {
      budgetUsdCents: 100,
    });

    expect(result.litellmProvisioned).toBe(false);
  });
});
