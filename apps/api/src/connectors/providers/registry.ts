import { McpConnectorProvider } from '../../generated/prisma/client.js';
import type { ProviderDefinition, PublicProviderDto } from '../types.js';
import { CLICKUP_PROVIDER } from './clickup.js';
import { FIREFLIES_PROVIDER } from './fireflies.js';
import { GMAIL_PROVIDER } from './gmail.js';
import { GOOGLE_ADS_PROVIDER } from './google-ads.js';
import { GOOGLE_ANALYTICS_PROVIDER } from './google-analytics.js';
import { GOOGLE_CALENDAR_PROVIDER } from './google-calendar.js';
import { GOOGLE_DRIVE_PROVIDER } from './google-drive.js';
import { HUBSPOT_PROVIDER } from './hubspot.js';
import { SLACK_PROVIDER } from './slack.js';
import { WOOCOMMERCE_PROVIDER } from './woocommerce.js';

/**
 * Ported verbatim from ragen-app's
 * src/features/connectors/providers/registry.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Every value in the Prisma `McpConnectorProvider` enum must have a
 * manifest here. Missing entries are caught at compile time thanks to
 * `Record<McpConnectorProvider, …>`.
 */
export const PROVIDER_REGISTRY: Record<
  McpConnectorProvider,
  ProviderDefinition
> = {
  [McpConnectorProvider.GOOGLE_CALENDAR]: GOOGLE_CALENDAR_PROVIDER,
  [McpConnectorProvider.GOOGLE_ANALYTICS]: GOOGLE_ANALYTICS_PROVIDER,
  [McpConnectorProvider.GOOGLE_ADS]: GOOGLE_ADS_PROVIDER,
  [McpConnectorProvider.GOOGLE_DRIVE]: GOOGLE_DRIVE_PROVIDER,
  [McpConnectorProvider.GMAIL]: GMAIL_PROVIDER,
  [McpConnectorProvider.CLICKUP]: CLICKUP_PROVIDER,
  [McpConnectorProvider.HUBSPOT]: HUBSPOT_PROVIDER,
  [McpConnectorProvider.FIREFLIES]: FIREFLIES_PROVIDER,
  [McpConnectorProvider.SLACK]: SLACK_PROVIDER,
  [McpConnectorProvider.WOOCOMMERCE]: WOOCOMMERCE_PROVIDER,
};

export const PROVIDER_LIST: readonly ProviderDefinition[] =
  Object.values(PROVIDER_REGISTRY);

export function getProvider(
  provider: McpConnectorProvider,
): ProviderDefinition {
  return PROVIDER_REGISTRY[provider];
}

/**
 * Strips everything a browser shouldn't see — OAuth secrets, server-side
 * auth config, and any function-valued prompt fragments. Not currently
 * used by anything in this slice — kept for parity with the original
 * registry's public API.
 */
export function toPublicProviderDto(
  def: ProviderDefinition,
): PublicProviderDto {
  return {
    provider: def.provider,
    name: def.name,
    description: def.description,
    icon: def.icon,
    mcpServerUrl: def.mcpServerUrl,
    authBaseUrl: def.authBaseUrl,
    authPath: def.authPath,
    authType: def.authType,
    apiKeyHelpUrl: def.apiKeyHelpUrl,
    scopes: def.scopes,
  };
}

export const PUBLIC_PROVIDER_LIST: readonly PublicProviderDto[] =
  PROVIDER_LIST.map(toPublicProviderDto);
