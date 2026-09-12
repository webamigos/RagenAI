/**
 * MCP connector metadata, keyed by the `McpConnectorProvider` enum values in
 * `prisma/schema.prisma`.
 *
 * The enum in the schema is the source of truth for *which* connectors exist;
 * this module carries what each one is called and which brand asset represents
 * it. Both apps that render a connector — the in-app connector gallery and the
 * admin allowlist — read from here, and each binds the map back to its own
 * generated Prisma enum so a missing entry fails typecheck at the binding site.
 */
export const CONNECTOR_PROVIDERS = [
  'GOOGLE_CALENDAR',
  'GOOGLE_ANALYTICS',
  'GOOGLE_ADS',
  'GOOGLE_DRIVE',
  'GMAIL',
  'CLICKUP',
  'HUBSPOT',
  'FIREFLIES',
  'SLACK',
  'WOOCOMMERCE',
  'OPEN_MERCATO',
] as const;

export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export type ConnectorDefinition = {
  value: ConnectorProvider;
  /** Brand name as written by its owner — "Fireflies.ai", not "Fireflies". */
  label: string;
  /** Path under each app's `public/`, so both serve the same asset. */
  icon: string;
};

export const CONNECTOR_METADATA: Record<
  ConnectorProvider,
  ConnectorDefinition
> = {
  GOOGLE_CALENDAR: {
    value: 'GOOGLE_CALENDAR',
    label: 'Google Calendar',
    icon: '/assets/connectors/google-calendar.svg',
  },
  GOOGLE_ANALYTICS: {
    value: 'GOOGLE_ANALYTICS',
    label: 'Google Analytics',
    icon: '/assets/connectors/google-analytics.svg',
  },
  GOOGLE_ADS: {
    value: 'GOOGLE_ADS',
    label: 'Google Ads',
    icon: '/assets/connectors/google-ads.svg',
  },
  GOOGLE_DRIVE: {
    value: 'GOOGLE_DRIVE',
    label: 'Google Drive',
    icon: '/assets/connectors/google-drive.svg',
  },
  GMAIL: {
    value: 'GMAIL',
    label: 'Gmail',
    icon: '/assets/connectors/gmail.svg',
  },
  CLICKUP: {
    value: 'CLICKUP',
    label: 'ClickUp',
    icon: '/assets/connectors/clickup.svg',
  },
  HUBSPOT: {
    value: 'HUBSPOT',
    label: 'HubSpot',
    icon: '/assets/connectors/hubspot.svg',
  },
  FIREFLIES: {
    value: 'FIREFLIES',
    label: 'Fireflies.ai',
    icon: '/assets/connectors/fireflies.svg',
  },
  SLACK: {
    value: 'SLACK',
    label: 'Slack',
    icon: '/assets/connectors/slack.svg',
  },
  WOOCOMMERCE: {
    value: 'WOOCOMMERCE',
    label: 'WooCommerce',
    icon: '/assets/connectors/woocommerce.svg',
  },
  OPEN_MERCATO: {
    value: 'OPEN_MERCATO',
    label: 'Open Mercato',
    icon: '/assets/connectors/open-mercato.svg',
  },
};

/** Enum value → icon path. The shape apps/web's `PROVIDER_ICON_PATHS` needs. */
export const CONNECTOR_ICON_PATHS: Record<ConnectorProvider, string> =
  Object.fromEntries(
    CONNECTOR_PROVIDERS.map((p) => [p, CONNECTOR_METADATA[p].icon]),
  ) as Record<ConnectorProvider, string>;

/** In schema order, for rendering a stable list. */
export const CONNECTOR_LIST: readonly ConnectorDefinition[] =
  CONNECTOR_PROVIDERS.map((p) => CONNECTOR_METADATA[p]);

export function isConnectorProvider(
  value: unknown,
): value is ConnectorProvider {
  return (
    typeof value === 'string' &&
    (CONNECTOR_PROVIDERS as readonly string[]).includes(value)
  );
}
