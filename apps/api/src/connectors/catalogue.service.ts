import { Injectable, Logger } from '@nestjs/common';
import { isMcpAuthType } from '@ragenai/platform-contracts';

import { PrismaService } from '../prisma/prisma.service.js';
import { definitionFromEntry } from './definition-from-entry.js';
import { getProviderDefinition } from './provider-definition.js';
import type { ProviderDefinition } from './types.js';

const CATALOG_SELECT = {
  publicId: true,
  slug: true,
  label: true,
  description: true,
  icon: true,
  lucideIcon: true,
  mcpServerUrl: true,
  authType: true,
  authBaseUrl: true,
  authPath: true,
  scopes: true,
  useUserScope: true,
  oauthCredentialsStored: true,
  systemPrompt: true,
  allowsPrivateAddress: true,
  isBuiltIn: true,
  enabled: true,
} as const;

/**
 * The catalogue, as this app resolves it.
 *
 * It is the same shape `apps/web` reads — rows merged with optional behaviour
 * packs — and it exists here for two reasons that are not cosmetic:
 *
 * - **A disabled entry has to stop working through the API too.** Disabling is
 *   the switch an operator has instead of a feature flag, and an entry that is
 *   off everywhere except the public API is not off.
 * - **An operator's connector URL is one somebody typed**, so it has to reach
 *   the address policy here as well. Resolving from the compiled manifests
 *   alone left this path dialling that URL with no check at all.
 */
@Injectable()
export class CatalogueService {
  private readonly logger = new Logger(CatalogueService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDefinitions(): Promise<ProviderDefinition[]> {
    const rows = await this.prisma.client.mcpCatalogEntry.findMany({
      where: { enabled: true },
      select: CATALOG_SELECT,
      orderBy: { id: 'asc' },
    });

    return rows.flatMap((row) => {
      if (!isMcpAuthType(row.authType)) {
        // A row whose auth shape this build has no member for is left out
        // rather than dialled under a guess — three services deploy
        // independently, so a newer member can reach the column first.
        this.logger.warn(
          `Catalogue entry ${row.slug} has an auth type this build does not know; skipping it`,
        );
        return [];
      }

      const entry = { ...row, authType: row.authType };
      return [definitionFromEntry(entry, getProviderDefinition(entry.slug))];
    });
  }

  /** The definitions keyed by slug, which is what the tool loader needs. */
  async getDefinitionsBySlug(): Promise<Record<string, ProviderDefinition>> {
    const definitions = await this.getDefinitions();
    return Object.fromEntries(
      definitions.map((definition) => [definition.provider, definition]),
    );
  }

  async resolve(slug: string): Promise<ProviderDefinition | undefined> {
    const definitions = await this.getDefinitions();
    return definitions.find((definition) => definition.provider === slug);
  }
}
