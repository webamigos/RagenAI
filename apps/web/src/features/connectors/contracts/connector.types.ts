import type {
  McpConnector,
  McpConnectorStatus,
} from '@/generated/prisma/client';

export type ConnectorDto = Pick<
  McpConnector,
  | 'id'
  | 'mcpServerUrl'
  | 'customerId'
  | 'enabled'
  | 'status'
  | 'connectedAt'
  | 'createdAt'
  // Rendered on the card when `status` is ERROR. Without these the user sees
  // a connector that looks merely disconnected and has no idea it broke.
  | 'lastError'
  | 'lastErrorAt'
> & {
  /**
   * The catalogue slug. Authoritative since B3 of
   * docs/specs/2026-09-18-mcp-servers-added-without-a-deploy.md: the enum
   * column is neither written nor read any more, so it is not on the wire
   * either. Read it through `connectorSlug()` rather than by name.
   */
  providerSlug: string;
};

export type SystemPromptContext = {
  timeZone: string;
};

export type SystemPromptFragment =
  string | ((ctx: SystemPromptContext) => string);

export type ProviderDefinition = {
  /**
   * A catalogue slug — a row in `McpCatalogEntry`. The eleven built-ins keep
   * the SHOUTING names they had as enum members, because vault token paths and
   * `customerId`s already hold those strings; an entry added from the panel is
   * lowercase-kebab.
   */
  provider: string;
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
  /**
   * True when this entry's OAuth client credentials are in ragen-token-vault
   * rather than in the environment — an entry an operator created. The values
   * are never columns (ADR-32), so this boolean is what a caller has before it
   * asks the vault for them.
   */
  oauthCredentialsStored?: boolean;
  /** If true, rewrites `scope` → `user_scope` in the OAuth authorization URL (required by Slack). */
  useUserScope?: boolean;
  /**
   * The brand asset for this connector, when it has one: a path under each
   * app's `public/` for a built-in, or whatever URL an operator gave their
   * entry. Distinct from `icon`, which is a lucide name.
   */
  iconUrl?: string | null;
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
  /**
   * Set when this connector's address is one somebody typed — a catalogue row
   * an operator created, or the shop URL a user supplies at connect time —
   * and must therefore pass the SSRF policy at connect time and on every tool
   * call after it. Absent for a built-in whose URL comes from
   * `MCP_*_SERVER_URL`, which is deployer-controlled and may legitimately be
   * loopback: that is the exemption `packages/connector-guard` documents.
   */
  addressGuard?: { allowPrivate: boolean };
};

/**
 * Client-safe slice of `ProviderDefinition` for passing across the RSC
 * boundary. Strips:
 *   - OAuth client secret/id (server-only — never ship credentials)
 *   - systemPromptFragment (can be a function → not serializable)
 *   - useUserScope, headerName, mcpServerUrlPath (server-side auth config)
 *
 * Only fields the Connectors UI actually needs are exposed.
 */
export type PublicProviderDto = {
  provider: string;
  name: string;
  description: string;
  /** A lucide icon name — the fallback when there is no brand asset. */
  icon: string;
  /**
   * The brand asset, from the catalogue row. A connector an operator added has
   * no file under `public/assets/connectors/`, so the map keyed by slug cannot
   * answer for it — and an `<img>` with no `src` renders as a broken image on
   * the card, which is what happens if this is forgotten.
   */
  iconUrl?: string | null;
  mcpServerUrl: string;
  authBaseUrl?: string;
  authPath?: string;
  authType?: ProviderDefinition['authType'];
  apiKeyHelpUrl?: string;
  scopes?: string[];
  singleTokenAuth?: boolean;
};

/**
 * Payload for the custom-header auth flow: user provides the instance/shop
 * URL plus a credential, stored as a single opaque token in the vault.
 * `consumerSecret` is omitted entirely for `singleTokenAuth` providers (e.g.
 * Open Mercato's single `omk_...` key) — WooCommerce is the two-part case,
 * where `consumerKey`/`consumerSecret` are joined before storage.
 */
export type CustomHeaderCredentials = {
  siteUrl: string;
  consumerKey: string;
  consumerSecret?: string;
};

export type { McpConnectorStatus };
