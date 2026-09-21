import {
  allowedCatalogEntries,
  type McpCatalogEntryDto,
} from '@ragenai/platform-contracts';
import {
  BUILT_IN_MCP_SERVERS,
  isBuiltInMcpSlug,
  resolveBuiltInMcpServerUrl,
} from '@ragenai/env';

/**
 * What the read-only catalogue page renders, worked out without a database so
 * it can be tested without one.
 *
 * The page is deliberately read-only in this release: an operator sees the
 * catalogue before they can change it, and nothing on the page claims an effect
 * it does not have.
 */
export type OrganizationAllowlist = {
  id: string;
  name: string;
  allowedConnectors: string[];
};

export type CatalogueEntryView = {
  entry: McpCatalogEntryDto;
  /** The address this installation would dial, and where the value came from. */
  serverUrl: string | null;
  serverUrlSource: 'row' | 'environment' | 'per-connector' | 'unset';
  /** Set when the URL comes from the environment, so the page can name it. */
  serverUrlVariable: string | null;
  /** Null when every organization may use it; otherwise the ones that may. */
  organizations: OrganizationAllowlist[] | null;
};

/**
 * A built-in's `mcp_server_url` column is null on purpose, and its behaviour
 * pack reads the environment — `apps/admin` has no behaviour packs, so it
 * resolves through the same seam the packs will.
 *
 * WooCommerce and Open Mercato have no deployment-wide address at all: theirs
 * is assembled per connector from the shop URL the user types at connect time.
 */
export function resolveServerUrl(entry: McpCatalogEntryDto): {
  serverUrl: string | null;
  serverUrlSource: CatalogueEntryView['serverUrlSource'];
  serverUrlVariable: string | null;
} {
  if (entry.mcpServerUrl) {
    return {
      serverUrl: entry.mcpServerUrl,
      serverUrlSource: 'row',
      serverUrlVariable: null,
    };
  }

  if (entry.authType === 'API_KEY_CUSTOM_HEADER') {
    return {
      serverUrl: null,
      serverUrlSource: 'per-connector',
      serverUrlVariable: null,
    };
  }

  if (isBuiltInMcpSlug(entry.slug)) {
    return {
      serverUrl: resolveBuiltInMcpServerUrl(entry.slug) ?? null,
      serverUrlSource: 'environment',
      serverUrlVariable: BUILT_IN_MCP_SERVERS[entry.slug].variable,
    };
  }

  return {
    serverUrl: null,
    serverUrlSource: 'unset',
    serverUrlVariable: null,
  };
}

/**
 * Which organizations may connect this entry, under the two-tier allowlist —
 * empty at either tier means no restriction there. Null means every
 * organization, which is a different statement from "all of them happen to be
 * listed" and the page says so.
 */
export function organizationsAllowing(
  entry: McpCatalogEntryDto,
  platformAllowed: readonly string[],
  organizations: readonly OrganizationAllowlist[],
): OrganizationAllowlist[] | null {
  const unrestricted =
    platformAllowed.length === 0 &&
    organizations.every((org) => org.allowedConnectors.length === 0);

  if (unrestricted) {
    return null;
  }

  return organizations.filter(
    (org) =>
      allowedCatalogEntries([entry], platformAllowed, org.allowedConnectors)
        .length > 0,
  );
}

export function toCatalogueEntryView(
  entry: McpCatalogEntryDto,
  platformAllowed: readonly string[],
  organizations: readonly OrganizationAllowlist[],
): CatalogueEntryView {
  return {
    entry,
    ...resolveServerUrl(entry),
    // A disabled entry reaches nobody, and saying "0 organizations" would
    // blame the allowlist for a decision the `enabled` switch made.
    organizations: entry.enabled
      ? organizationsAllowing(entry, platformAllowed, organizations)
      : [],
  };
}
