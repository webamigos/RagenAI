import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTeamFindFirst = vi.fn();
const mockTeamMemberFindMany = vi.fn();
const mockGetOrgKey = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    team: {
      findFirst: (...args: unknown[]) => mockTeamFindFirst(...args),
    },
    teamMember: {
      findMany: (...args: unknown[]) => mockTeamMemberFindMany(...args),
    },
  },
}));

vi.mock('@/app/lib/utils/hashApiKey', () => ({
  decryptApiKey: (v: string) => v.replace('enc:', ''),
}));

vi.mock('@/features/organizations/services/organization-settings', () => ({
  getLiteLLMOrgApiKey: (...args: unknown[]) => mockGetOrgKey(...args),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { resolveLiteLLMKeyQuery } from '../resolve-litellm-key-query';

describe('resolveLiteLLMKeyQuery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetOrgKey.mockResolvedValue('sk-org-key');
    mockTeamMemberFindMany.mockResolvedValue([]);
  });

  it('returns the active team key when caller is a member and team is provisioned', async () => {
    mockTeamFindFirst.mockResolvedValue({
      id: 'team-1',
      litellmKeyToken: 'enc:sk-team-key',
    });

    const result = await resolveLiteLLMKeyQuery({
      orgId: 'org-1',
      userId: 'user-1',
      activeTeamId: 'team-1',
    });

    expect(result).toEqual({
      teamId: 'team-1',
      apiKey: 'sk-team-key',
      source: 'team',
    });
    expect(mockGetOrgKey).not.toHaveBeenCalled();
  });

  it('falls back to org key when activeTeamId refers to a team the user does not belong to', async () => {
    mockTeamFindFirst.mockResolvedValue(null);

    const result = await resolveLiteLLMKeyQuery({
      orgId: 'org-1',
      userId: 'user-1',
      activeTeamId: 'team-x',
    });

    expect(result).toEqual({
      teamId: null,
      apiKey: 'sk-org-key',
      source: 'org',
    });
  });

  it('falls back to org key when active team is not yet provisioned', async () => {
    mockTeamFindFirst.mockResolvedValue({
      id: 'team-1',
      litellmKeyToken: null,
    });

    const result = await resolveLiteLLMKeyQuery({
      orgId: 'org-1',
      userId: 'user-1',
      activeTeamId: 'team-1',
    });

    expect(result?.source).toBe('org');
  });

  it('auto-selects the sole team when the user belongs to exactly one provisioned team', async () => {
    mockTeamFindFirst.mockResolvedValue(null);
    mockTeamMemberFindMany.mockResolvedValue([
      {
        team: { id: 'team-only', litellmKeyToken: 'enc:sk-solo' },
      },
    ]);

    const result = await resolveLiteLLMKeyQuery({
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result).toEqual({
      teamId: 'team-only',
      apiKey: 'sk-solo',
      source: 'team',
    });
    expect(mockGetOrgKey).not.toHaveBeenCalled();
  });

  it('does not auto-select when the user belongs to multiple teams', async () => {
    mockTeamFindFirst.mockResolvedValue(null);
    mockTeamMemberFindMany.mockResolvedValue([
      { team: { id: 'team-a', litellmKeyToken: 'enc:a' } },
      { team: { id: 'team-b', litellmKeyToken: 'enc:b' } },
    ]);

    const result = await resolveLiteLLMKeyQuery({
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result?.source).toBe('org');
  });

  it('returns null when neither a team key nor an org key is available', async () => {
    mockGetOrgKey.mockResolvedValue(null);
    mockTeamFindFirst.mockResolvedValue(null);

    const result = await resolveLiteLLMKeyQuery({
      orgId: 'org-1',
      userId: null,
    });

    expect(result).toBeNull();
  });

  it('skips the team-lookup path when userId is absent (public chat)', async () => {
    const result = await resolveLiteLLMKeyQuery({
      orgId: 'org-1',
      userId: null,
      activeTeamId: 'team-1',
    });

    expect(mockTeamFindFirst).not.toHaveBeenCalled();
    expect(mockTeamMemberFindMany).not.toHaveBeenCalled();
    expect(result?.source).toBe('org');
  });
});
