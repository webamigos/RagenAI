import type {
  McpConnector,
  McpConnectorProvider,
  McpConnectorStatus,
} from '../generated/prisma/client.js';

/**
 * Ported verbatim from apps/web's
 * src/features/connectors/contracts/connector.types.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 */

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
  // Rendered by apps/web's ConnectorCard when `status` is ERROR. This Pick and
  // apps/web's are hand-copied siblings, so both must gain a field together —
  // `tests/architecture/connector-dto-agrees.test.ts` enforces that, because
  // typecheck only ever sees one of them.
  | 'lastError'
  | 'lastErrorAt'
>;

export type SystemPromptContext = {
  timeZone: string;
};

export type SystemPromptFragment =
  string | ((ctx: SystemPromptContext) => string);

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
    | 'external_mcp'
    /**
     * The MCP service owns the upstream credential server-side (e.g. a
     * single service-wide API key on the MCP container). No user
     * credentials collected, no OAuth popup. Click Connect → the
     * McpConnector row is created in `CONNECTED` state directly.
     * The only caller-side identifier is `x-customer-id` in MCP
     * requests, which the client injects automatically.
     */
    | 'server_side';
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
  /**
   * For `api_key_custom_header` providers whose credential is a single
   * opaque key (e.g. Open Mercato's `omk_...`) rather than a two-part
   * consumer key + secret (WooCommerce). Drives both the connect dialog
   * (hides the secret field, relabels the key field) and the server-side
   * validation/token-combining logic in `ConnectorsService`.
   */
  singleTokenAuth?: boolean;
  /**
   * Provider-specific guidance appended to the system prompt when this
   * connector is enabled in a chat. Can be a static string or a function
   * that receives the user's timezone (used by time-sensitive providers
   * like Google Calendar).
   */
  systemPromptFragment?: SystemPromptFragment;
};

/**
 * Client-safe slice of `ProviderDefinition` for passing across a UI
 * boundary. Strips OAuth secrets, systemPromptFragment (may be a function),
 * and server-side auth config. Not currently used by anything in this
 * slice — kept for parity with the original registry's public API.
 */
export type PublicProviderDto = {
  provider: McpConnectorProvider;
  name: string;
  description: string;
  icon: string;
  mcpServerUrl: string;
  authBaseUrl?: string;
  authPath?: string;
  authType?: ProviderDefinition['authType'];
  apiKeyHelpUrl?: string;
  scopes?: string[];
  singleTokenAuth?: boolean;
};

/**
 * `consumerSecret` is omitted entirely for `singleTokenAuth` providers (e.g.
 * Open Mercato's single `omk_...` key) — WooCommerce is the two-part case,
 * where `consumerKey`/`consumerSecret` are joined before storage.
 */
export type CustomHeaderCredentials = {
  siteUrl: string;
  consumerKey: string;
  consumerSecret?: string;
};

export type { McpConnectorProvider, McpConnectorStatus };
