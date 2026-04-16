import { McpConnectorProvider } from '@/generated/prisma/client';
import type { ProviderDefinition } from '../contracts/connector.types';
import { CLICKUP_PROVIDER } from './clickup';
import { FIREFLIES_PROVIDER } from './fireflies';
import { GMAIL_PROVIDER } from './gmail';
import { GOOGLE_ADS_PROVIDER } from './google-ads';
import { GOOGLE_ANALYTICS_PROVIDER } from './google-analytics';
import { GOOGLE_CALENDAR_PROVIDER } from './google-calendar';
import { GOOGLE_DRIVE_PROVIDER } from './google-drive';
import { HUBSPOT_PROVIDER } from './hubspot';
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
