import type { McpConnectorProvider } from '@/generated/prisma/client';

/**
 * Single source of truth mapping an `McpConnectorProvider` enum value
 * to the SVG asset that represents that brand. Kept as a plain module
 * (not a React component) so it's equally usable from server code,
 * tests, and non-React UI (SVG imports, meta tags, etc.).
 *
 * New providers must add an entry here AND a matching SVG under
 * `public/assets/connectors/`.
 */
export const PROVIDER_ICON_PATHS: Record<McpConnectorProvider, string> = {
  GOOGLE_CALENDAR: '/assets/connectors/google-calendar.svg',
  GOOGLE_ANALYTICS: '/assets/connectors/google-analytics.svg',
  GOOGLE_ADS: '/assets/connectors/google-ads.svg',
  GOOGLE_DRIVE: '/assets/connectors/google-drive.svg',
  GMAIL: '/assets/connectors/gmail.svg',
  CLICKUP: '/assets/connectors/clickup.svg',
  HUBSPOT: '/assets/connectors/hubspot.svg',
  FIREFLIES: '/assets/connectors/fireflies.svg',
  SLACK: '/assets/connectors/slack.svg',
  WOOCOMMERCE: '/assets/connectors/woocommerce.svg',
};

/**
 * MCP tool names are prefixed with the provider slug using `__` as
 * separator — e.g. `clickup__create_task`, `google_calendar__
 * gcal_create_event`. Split and UPPERCASE to match the enum shape the
 * icon map is keyed by. Unknown / malformed names return null so the
 * caller can render a fallback.
 */
export function providerFromToolName(
  toolName: string,
): McpConnectorProvider | null {
  const prefix = toolName.split('__')[0];
  if (!prefix) {
    return null;
  }
  const asEnum = prefix.toUpperCase() as McpConnectorProvider;
  return asEnum in PROVIDER_ICON_PATHS ? asEnum : null;
}

export function iconPathForProvider(provider: string | null): string | null {
  if (!provider) {
    return null;
  }
  return PROVIDER_ICON_PATHS[provider as McpConnectorProvider] ?? null;
}
