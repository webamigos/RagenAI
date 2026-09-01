import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrganizationSettingsService } from '../organizations/organization-settings.service.js';
import { decryptApiKey } from '../organizations/hash-api-key.js';

export type LiteLLMKeyResolution = {
  teamId: string | null;
  apiKey: string;
  source: 'team' | 'org';
};

/**
 * Ported from ragen-app's
 * src/features/teams/services/queries/resolve-litellm-key-query.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Resolve which LiteLLM virtual key to use for a request.
 *
 * Precedence:
 *   1. The session's `activeTeamId` if the caller is a member of that
 *      team AND the team has a provisioned virtual key.
 *   2. If the caller belongs to exactly one team in the org, that team's
 *      key (so the single-team case "just works" without a UI selector).
 *   3. The organization's key.
 *
 * Non-member / unprovisioned / missing teams fall through silently —
 * a compromised cookie can't route through a team you don't belong to,
 * and we prefer to charge the org key over failing the request.
 *
 * Returns null when neither a team key nor an org key is available so
 * the caller can decide whether to fall back to `LITELLM_MASTER_KEY`.
 */
@Injectable()
export class ResolveLiteLLMKeyService {
  private readonly logger = new Logger(ResolveLiteLLMKeyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationSettings: OrganizationSettingsService,
  ) {}

  async resolve({
    orgId,
    userId,
    activeTeamId,
  }: {
    orgId: string;
    userId: string | null;
    activeTeamId?: string | null;
  }): Promise<LiteLLMKeyResolution | null> {
    if (userId) {
      const resolvedTeam = await this.resolveTeamKey(
        orgId,
        userId,
        activeTeamId,
      );
      if (resolvedTeam) {
        return resolvedTeam;
      }
    }

    const orgKey = await this.organizationSettings.getLiteLLMOrgApiKey(orgId);
    if (orgKey) {
      return { teamId: null, apiKey: orgKey, source: 'org' };
    }

    return null;
  }

  /**
   * Ported from ragen-app's src/app/api/v1/resolve-litellm-key.ts — shared
   * key-resolution + structured-log wrapper for the external OpenAI-compat
   * endpoints. Keeps `{ requestedTeamId, resolvedTeamId, keySource }`
   * emitted the same way whether the caller hits `/v1/chat` or
   * `/v1/chat/completions`.
   */
  async resolveForRequest({
    orgId,
    userId,
    teamId,
    routeTag,
  }: {
    orgId: string;
    userId: string;
    /** Optional team id propagated via `x-ragen-team-id`. */
    teamId?: string;
    /** Route identifier used in the log entry (e.g. 'v1.chat.completions'). */
    routeTag: string;
  }): Promise<{
    apiKey: string | undefined;
    teamId: string | null;
    source: 'team' | 'org' | 'master';
  }> {
    const resolution = await this.resolve({
      orgId,
      userId,
      activeTeamId: teamId,
    });

    this.logger.log(`Resolved LiteLLM key for ${routeTag}`, {
      orgId,
      userId,
      requestedTeamId: teamId ?? null,
      resolvedTeamId: resolution?.teamId ?? null,
      keySource: resolution?.source ?? 'master',
    });

    return {
      apiKey: resolution?.apiKey,
      teamId: resolution?.teamId ?? null,
      source: resolution?.source ?? 'master',
    };
  }

  private async resolveTeamKey(
    orgId: string,
    userId: string,
    activeTeamId: string | null | undefined,
  ): Promise<LiteLLMKeyResolution | null> {
    if (activeTeamId) {
      const team = await this.loadTeamForMember(orgId, userId, activeTeamId);
      if (team?.litellmKeyToken) {
        return {
          teamId: team.id,
          apiKey: decryptApiKey(team.litellmKeyToken),
          source: 'team',
        };
      }
      if (team && !team.litellmKeyToken) {
        this.logger.warn('Active team has no LiteLLM key yet — falling back', {
          orgId,
          userId,
          teamId: activeTeamId,
        });
      }
    }

    const memberships = await this.prisma.client.teamMember.findMany({
      where: {
        userId,
        team: { organizationId: orgId, litellmKeyToken: { not: null } },
      },
      include: {
        team: {
          select: { id: true, litellmKeyToken: true },
        },
      },
      take: 2,
    });

    if (memberships.length === 1) {
      const team = memberships[0].team;
      if (team.litellmKeyToken) {
        return {
          teamId: team.id,
          apiKey: decryptApiKey(team.litellmKeyToken),
          source: 'team',
        };
      }
    }

    return null;
  }

  private async loadTeamForMember(
    orgId: string,
    userId: string,
    teamId: string,
  ): Promise<{ id: string; litellmKeyToken: string | null } | null> {
    return this.prisma.client.team.findFirst({
      where: {
        id: teamId,
        organizationId: orgId,
        members: { some: { userId } },
      },
      select: { id: true, litellmKeyToken: true },
    });
  }
}
