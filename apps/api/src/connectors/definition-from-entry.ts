import {
  CONNECTOR_ICON_PATHS,
  type McpCatalogEntryDto,
} from '@ragenai/platform-contracts';

import type { ProviderDefinition } from './types.js';

/**
 * A catalogue row plus its optional behaviour pack, as one
 * `ProviderDefinition` — the shape every connector path in this app already
 * takes. Ported from apps/web's
 * `src/features/connectors/utils/definition-from-entry.ts`; see
 * docs/adrs/21-monorepo-and-api-decoupling.md for why there are two.
 *
 * The division of labour is the spec's: the row says *what* the connector is
 * (label, description, icons, scopes, auth shape, prompt text) and the pack
 * says the two things a row cannot hold — a system prompt that must compute,
 * and `api_key_custom_header` URL assembly — plus the values that belong to
 * the deployment rather than the database: a built-in's server URL and OAuth
 * client credentials, which are read from the environment at module load.
 *
 * A row with no pack resolves completely. That is the whole point: Notion is a
 * row.
 */
const AUTH_TYPE_FROM_ROW: Record<string, ProviderDefinition['authType']> = {
  SERVER_SIDE: 'server_side',
  API_KEY_BEARER: 'api_key_bearer',
  EXTERNAL_MCP: 'external_mcp',
  API_KEY_CUSTOM_HEADER: 'api_key_custom_header',
  OAUTH: 'oauth',
  API_KEY: 'api_key',
};

export function definitionFromEntry(
  entry: McpCatalogEntryDto,
  pack: ProviderDefinition | undefined,
): ProviderDefinition {
  return {
    provider: entry.slug,
    name: entry.label,
    description: entry.description ?? pack?.description ?? '',
    // `ProviderDefinition.icon` is the lucide name; the brand asset is a
    // separate field and is looked up by slug where it is rendered.
    icon: entry.lucideIcon ?? pack?.icon ?? 'plug',
    // The row's own asset, or the built-in one this app ships. Null for an
    // entry whose operator gave it neither, and the card renders the lucide
    // icon instead of a broken image.
    iconUrl: entry.icon ?? CONNECTOR_ICON_PATHS[entry.slug] ?? null,
    // Null on a built-in row on purpose — its address is the environment's,
    // and a database promoted between environments must not move it.
    mcpServerUrl: entry.mcpServerUrl ?? pack?.mcpServerUrl ?? '',
    authBaseUrl: entry.authBaseUrl ?? pack?.authBaseUrl,
    authPath: entry.authPath ?? pack?.authPath,
    authType: AUTH_TYPE_FROM_ROW[entry.authType],
    apiKeyHelpUrl: pack?.apiKeyHelpUrl,
    // The row, not the pack, and deliberately with no fallback: an empty
    // list is an operator clearing the scopes, and falling back would make
    // that impossible to express. Every built-in that needs scopes carries
    // them on its seeded row, so nothing loses them.
    scopes: entry.scopes,
    // Credentials never become columns (ADR-32). A built-in reads them from
    // the environment through its pack; an operator's entry stores them in
    // ragen-token-vault, which Phase D wires in.
    oauthClientId: pack?.oauthClientId,
    oauthClientSecret: pack?.oauthClientSecret,
    oauthCredentialsStored: entry.oauthCredentialsStored,
    // Same reason as `scopes` above: `false` is an answer, not an absence.
    // Slack's row is seeded with it set, so turning it off is now possible.
    useUserScope: entry.useUserScope,
    headerName: pack?.headerName,
    mcpServerUrlPath: pack?.mcpServerUrlPath,
    singleTokenAuth: pack?.singleTokenAuth,
    // Text on the row, or a fragment that must compute. Never both, and never
    // a second branch elsewhere.
    systemPromptFragment: entry.systemPrompt ?? pack?.systemPromptFragment,
    addressGuard: addressGuardFor(entry),
  };
}

/**
 * Which connectors get the SSRF policy, and under which setting.
 *
 * The exemption in `packages/connector-guard` is for *deployer-controlled*
 * URLs — `MCP_*_SERVER_URL`, which may legitimately be loopback because
 * apps/api talks to services on the same host. A built-in resolves its
 * address from there and keeps the exemption.
 *
 * Everything else is an address somebody typed: a catalogue row an operator
 * created, or the shop URL a user supplies at connect time for the two
 * custom-header connectors. Those are checked, with `allowsPrivateAddress`
 * deciding whether RFC 1918 space is admitted — and nothing else is, whatever
 * that flag says.
 */
function addressGuardFor(
  entry: McpCatalogEntryDto,
): { allowPrivate: boolean } | undefined {
  const addressIsTyped =
    entry.mcpServerUrl !== null || entry.authType === 'API_KEY_CUSTOM_HEADER';

  return addressIsTyped
    ? { allowPrivate: entry.allowsPrivateAddress }
    : undefined;
}
