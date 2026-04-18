import { McpConnectorProvider } from '@/generated/prisma/client';
import type {
  ProviderDefinition,
  PublicProviderDto,
} from '../contracts/connector.types';
import { CLICKUP_PROVIDER } from './clickup';
import { FIREFLIES_PROVIDER } from './fireflies';
import { GMAIL_PROVIDER } from './gmail';
import { GOOGLE_ADS_PROVIDER } from './google-ads';
import { GOOGLE_ANALYTICS_PROVIDER } from './google-analytics';
import { GOOGLE_CALENDAR_PROVIDER } from './google-calendar';
import { GOOGLE_DRIVE_PROVIDER } from './google-drive';
import { HUBSPOT_PROVIDER } from './hubspot';
import { REJESTRIO_PROVIDER } from './rejestrio';
import { SLACK_PROVIDER } from './slack';
import { WOOCOMMERCE_PROVIDER } from './woocommerce';

/**
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
  [McpConnectorProvider.REJESTRIO]: REJESTRIO_PROVIDER,
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
 * auth config, and any function-valued prompt fragments (which cannot
 * cross the RSC boundary). Call this on the server before handing a
 * provider to a client component.
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
