import type {
  McpConnector,
  McpConnectorProvider,
  McpConnectorStatus,
} from '@/generated/prisma/client';

export type ConnectorDto = Pick<
  McpConnector,
  | 'id'
  | 'provider'
  | 'mcpServerUrl'
  | 'customerId'
  | 'enabled'
  | 'status'
  | 'connectedAt'
  | 'createdAt'
>;

export type ProviderDefinition = {
  provider: McpConnectorProvider;
  name: string;
  description: string;
  icon: string;
  /**
   * For fixed-URL providers this is the MCP endpoint.
   * For `api_key_custom_header` providers with `mcpServerUrlPath` set,
   * this is ignored at runtime — the user-supplied shop URL is combined
   * with `mcpServerUrlPath` at registration time and stored on the connector.
   */
  mcpServerUrl: string;
  authBaseUrl?: string;
  authPath?: string;
  authType?:
    | 'oauth'
    | 'api_key'
    | 'api_key_bearer'
    | 'api_key_custom_header'
    | 'external_mcp';
  apiKeyHelpUrl?: string;
  scopes?: string[];
  oauthClientId?: string;
  oauthClientSecret?: string;
  /** If true, rewrites `scope` → `user_scope` in the OAuth authorization URL (required by Slack). */
  useUserScope?: boolean;
  /** For `api_key_custom_header`: HTTP header name (e.g. `X-MCP-API-Key`). */
  headerName?: string;
  /** For `api_key_custom_header`: path appended to the user-supplied site URL (e.g. `/wp-json/woocommerce/mcp`). */
  mcpServerUrlPath?: string;
};

/**
 * Payload for the WooCommerce-style custom-header auth flow: user provides
 * the shop URL and two REST-API keys, which are joined and stored as a
 * single opaque token in the vault.
 */
export type CustomHeaderCredentials = {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

export type { McpConnectorProvider, McpConnectorStatus };
