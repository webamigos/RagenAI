/* eslint-disable @typescript-eslint/unbound-method */
jest.mock('../organizations/hash-api-key.js', () => ({
  decryptApiKey: (v: string) => v.replace('enc:', ''),
}));

import { ResolveLiteLLMKeyService } from './resolve-litellm-key.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type OrganizationSettingsService } from '../organizations/organization-settings.service.js';

describe('ResolveLiteLLMKeyService', () => {
  function makeService(
    overrides: {
      teamFindFirst?: unknown;
      teamMemberFindMany?: unknown[];
      orgKey?: string | null;
    } = {},
  ) {
    const teamFindFirst = jest
      .fn()
      .mockResolvedValue(overrides.teamFindFirst ?? null);
    const teamMemberFindMany = jest
      .fn()
      .mockResolvedValue(overrides.teamMemberFindMany ?? []);
    const prisma = {
      client: {
        team: { findFirst: teamFindFirst },
        teamMember: { findMany: teamMemberFindMany },
      },
    } as unknown as PrismaService;
    const organizationSettings = {
      getLiteLLMOrgApiKey: jest
        .fn()
        .mockResolvedValue(
          overrides.orgKey === undefined ? 'sk-org-key' : overrides.orgKey,
        ),
    } as unknown as OrganizationSettingsService;
    return {
      service: new ResolveLiteLLMKeyService(prisma, organizationSettings),
      teamFindFirst,
      teamMemberFindMany,
      organizationSettings,
    };
  }

  describe('resolve', () => {
    it('returns the active team key when caller is a member and team is provisioned', async () => {
      const { service, organizationSettings } = makeService({
        teamFindFirst: { id: 'team-1', litellmKeyToken: 'enc:sk-team-key' },
      });

      const result = await service.resolve({
        orgId: 'org-1',
        userId: 'user-1',
        activeTeamId: 'team-1',
      });

      expect(result).toEqual({
        teamId: 'team-1',
        apiKey: 'sk-team-key',
        source: 'team',
      });
      expect(organizationSettings.getLiteLLMOrgApiKey).not.toHaveBeenCalled();
    });

    it('falls back to org key when activeTeamId refers to a team the user does not belong to', async () => {
      const { service } = makeService({ teamFindFirst: null });

      const result = await service.resolve({
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
      const { service } = makeService({
        teamFindFirst: { id: 'team-1', litellmKeyToken: null },
      });

      const result = await service.resolve({
        orgId: 'org-1',
        userId: 'user-1',
        activeTeamId: 'team-1',
      });

      expect(result?.source).toBe('org');
    });

    it('auto-selects the sole team when the user belongs to exactly one provisioned team', async () => {
      const { service, organizationSettings } = makeService({
        teamFindFirst: null,
        teamMemberFindMany: [
          { team: { id: 'team-only', litellmKeyToken: 'enc:sk-solo' } },
        ],
      });

      const result = await service.resolve({
        orgId: 'org-1',
        userId: 'user-1',
      });

      expect(result).toEqual({
        teamId: 'team-only',
        apiKey: 'sk-solo',
        source: 'team',
      });
      expect(organizationSettings.getLiteLLMOrgApiKey).not.toHaveBeenCalled();
    });

    it('does not auto-select when the user belongs to multiple teams', async () => {
      const { service } = makeService({
        teamFindFirst: null,
        teamMemberFindMany: [
          { team: { id: 'team-a', litellmKeyToken: 'enc:a' } },
          { team: { id: 'team-b', litellmKeyToken: 'enc:b' } },
        ],
      });

      const result = await service.resolve({
        orgId: 'org-1',
        userId: 'user-1',
      });

      expect(result?.source).toBe('org');
    });

    it('returns null when neither a team key nor an org key is available', async () => {
      const { service } = makeService({ teamFindFirst: null, orgKey: null });

      const result = await service.resolve({ orgId: 'org-1', userId: null });

      expect(result).toBeNull();
    });

    it('skips the team-lookup path when userId is absent (public chat)', async () => {
      const { service, teamFindFirst, teamMemberFindMany } = makeService();

      const result = await service.resolve({
        orgId: 'org-1',
        userId: null,
        activeTeamId: 'team-1',
      });

      expect(teamFindFirst).not.toHaveBeenCalled();
      expect(teamMemberFindMany).not.toHaveBeenCalled();
      expect(result?.source).toBe('org');
    });
  });

  describe('resolveForRequest', () => {
    it('defaults to master source and undefined apiKey when nothing resolves', async () => {
      const { service } = makeService({ teamFindFirst: null, orgKey: null });

      const result = await service.resolveForRequest({
        orgId: 'org-1',
        userId: 'user-1',
        routeTag: 'v1.chat',
      });

      expect(result).toEqual({
        apiKey: undefined,
        teamId: null,
        source: 'master',
      });
    });

    it('returns the resolved team key with its source', async () => {
      const { service } = makeService({
        teamFindFirst: { id: 'team-1', litellmKeyToken: 'enc:sk-team-key' },
      });

      const result = await service.resolveForRequest({
        orgId: 'org-1',
        userId: 'user-1',
        teamId: 'team-1',
        routeTag: 'v1.chat.completions',
      });

      expect(result).toEqual({
        apiKey: 'sk-team-key',
        teamId: 'team-1',
        source: 'team',
      });
    });
  });
});
