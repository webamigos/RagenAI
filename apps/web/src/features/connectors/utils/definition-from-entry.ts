import type { McpCatalogEntryDto } from '@ragenai/platform-contracts';
import type { ProviderDefinition } from '../contracts/connector.types';

/**
 * A catalogue row plus its optional behaviour pack, as one
 * `ProviderDefinition` — the shape every connector path in this app already
 * takes.
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
    // Null on a built-in row on purpose — its address is the environment's,
    // and a database promoted between environments must not move it.
    mcpServerUrl: entry.mcpServerUrl ?? pack?.mcpServerUrl ?? '',
    authBaseUrl: entry.authBaseUrl ?? pack?.authBaseUrl,
    authPath: entry.authPath ?? pack?.authPath,
    authType: AUTH_TYPE_FROM_ROW[entry.authType],
    apiKeyHelpUrl: pack?.apiKeyHelpUrl,
    scopes: entry.scopes.length > 0 ? entry.scopes : pack?.scopes,
    // Credentials never become columns (ADR-32). A built-in reads them from
    // the environment through its pack; an operator's entry stores them in
    // ragen-token-vault, which Phase D wires in.
    oauthClientId: pack?.oauthClientId,
    oauthClientSecret: pack?.oauthClientSecret,
    useUserScope: entry.useUserScope || pack?.useUserScope,
    headerName: pack?.headerName,
    mcpServerUrlPath: pack?.mcpServerUrlPath,
    singleTokenAuth: pack?.singleTokenAuth,
    // Text on the row, or a fragment that must compute. Never both, and never
    // a second branch elsewhere.
    systemPromptFragment: entry.systemPrompt ?? pack?.systemPromptFragment,
  };
}
