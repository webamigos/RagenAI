import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDeleteLiteLLMKey = vi.fn();
const mockDeleteLiteLLMTeam = vi.fn();

vi.mock('@/libs/litellm/client', () => ({
  deleteLiteLLMKey: (...args: unknown[]) => mockDeleteLiteLLMKey(...args),
  deleteLiteLLMTeam: (...args: unknown[]) => mockDeleteLiteLLMTeam(...args),
}));

vi.mock('@/app/lib/utils/hashApiKey', () => ({
  decryptApiKey: (v: string) => v.replace('enc:', ''),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { deprovisionLiteLLMForTeamCommand } from '../deprovision-litellm-team-command';

describe('deprovisionLiteLLMForTeamCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteLiteLLMKey.mockResolvedValue(undefined);
    mockDeleteLiteLLMTeam.mockResolvedValue(undefined);
  });

  it('revokes the decrypted key and deletes the LiteLLM team', async () => {
    await deprovisionLiteLLMForTeamCommand({
      teamId: 'team-1',
      litellmTeamId: 'team-1',
      litellmKeyToken: 'enc:sk-key-1',
    });

    expect(mockDeleteLiteLLMKey).toHaveBeenCalledWith('sk-key-1');
    expect(mockDeleteLiteLLMTeam).toHaveBeenCalledWith('team-1');
  });

  it('still deletes the team when key revocation fails', async () => {
    mockDeleteLiteLLMKey.mockRejectedValue(new Error('Failed: 500 x'));

    await deprovisionLiteLLMForTeamCommand({
      teamId: 'team-1',
      litellmTeamId: 'team-1',
      litellmKeyToken: 'enc:sk-key-1',
    });

    expect(mockDeleteLiteLLMTeam).toHaveBeenCalledWith('team-1');
  });

  it('skips when both ids are absent', async () => {
    await deprovisionLiteLLMForTeamCommand({
      teamId: 'team-1',
      litellmTeamId: null,
      litellmKeyToken: null,
    });

    expect(mockDeleteLiteLLMKey).not.toHaveBeenCalled();
    expect(mockDeleteLiteLLMTeam).not.toHaveBeenCalled();
  });

  it('does not throw when one of the remote calls fails after retries', async () => {
    mockDeleteLiteLLMKey.mockRejectedValue(new Error('Failed: 500 x'));
    mockDeleteLiteLLMTeam.mockRejectedValue(new Error('Failed: 500 x'));

    await expect(
      deprovisionLiteLLMForTeamCommand({
        teamId: 'team-1',
        litellmTeamId: 'team-1',
        litellmKeyToken: 'enc:sk-key-1',
      }),
    ).resolves.toBeUndefined();
  });
});
