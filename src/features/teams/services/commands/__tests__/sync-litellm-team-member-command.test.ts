import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockAdd = vi.fn();
const mockRemove = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    team: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock('@/libs/litellm/client', () => ({
  addLiteLLMTeamMember: (...args: unknown[]) => mockAdd(...args),
  removeLiteLLMTeamMember: (...args: unknown[]) => mockRemove(...args),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  syncLiteLLMTeamMemberAddCommand,
  syncLiteLLMTeamMemberRemoveCommand,
} from '../sync-litellm-team-member-command';

describe('syncLiteLLMTeamMemberAddCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue(undefined);
  });

  it('calls LiteLLM with the resolved litellmTeamId', async () => {
    mockFindUnique.mockResolvedValue({ litellmTeamId: 'litellm-team-1' });

    await syncLiteLLMTeamMemberAddCommand({
      teamId: 'team-1',
      userId: 'user-1',
      userEmail: 'u@example.com',
    });

    expect(mockAdd).toHaveBeenCalledWith({
      teamId: 'litellm-team-1',
      userId: 'user-1',
      userEmail: 'u@example.com',
    });
  });

  it('bails silently when the team has no LiteLLM counterpart', async () => {
    mockFindUnique.mockResolvedValue({ litellmTeamId: null });

    await syncLiteLLMTeamMemberAddCommand({
      teamId: 'team-1',
      userId: 'user-1',
    });

    expect(mockAdd).not.toHaveBeenCalled();
  });
});

describe('syncLiteLLMTeamMemberRemoveCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemove.mockResolvedValue(undefined);
  });

  it('calls LiteLLM with the resolved litellmTeamId', async () => {
    mockFindUnique.mockResolvedValue({ litellmTeamId: 'litellm-team-1' });

    await syncLiteLLMTeamMemberRemoveCommand({
      teamId: 'team-1',
      userId: 'user-1',
    });

    expect(mockRemove).toHaveBeenCalledWith({
      teamId: 'litellm-team-1',
      userId: 'user-1',
      userEmail: undefined,
    });
  });

  it('bails silently when the team has no LiteLLM counterpart', async () => {
    mockFindUnique.mockResolvedValue(null);

    await syncLiteLLMTeamMemberRemoveCommand({
      teamId: 'team-1',
      userId: 'user-1',
    });

    expect(mockRemove).not.toHaveBeenCalled();
  });
});
