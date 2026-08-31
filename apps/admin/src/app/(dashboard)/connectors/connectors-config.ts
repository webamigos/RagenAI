export type ConnectorDefinition = {
  value: string;
  label: string;
  icon: string;
};

export const allConnectors: ConnectorDefinition[] = [
  {
    value: 'GOOGLE_DRIVE',
    label: 'Google Drive',
    icon: '/assets/connectors/google-drive.svg',
  },
  {
    value: 'GOOGLE_CALENDAR',
    label: 'Google Calendar',
    icon: '/assets/connectors/google-calendar.svg',
  },
  {
    value: 'GMAIL',
    label: 'Gmail',
    icon: '/assets/connectors/gmail.svg',
  },
  {
    value: 'GOOGLE_ANALYTICS',
    label: 'Google Analytics',
    icon: '/assets/connectors/google-analytics.svg',
  },
  {
    value: 'GOOGLE_ADS',
    label: 'Google Ads',
    icon: '/assets/connectors/google-ads.svg',
  },
  {
    value: 'CLICKUP',
    label: 'ClickUp',
    icon: '/assets/connectors/clickup.svg',
  },
  {
    value: 'HUBSPOT',
    label: 'HubSpot',
    icon: '/assets/connectors/hubspot.svg',
  },
  {
    value: 'SLACK',
    label: 'Slack',
    icon: '/assets/connectors/slack.svg',
  },
  {
    value: 'FIREFLIES',
    label: 'Fireflies.ai',
    icon: '/assets/connectors/fireflies.svg',
  },
  {
    value: 'WOOCOMMERCE',
    label: 'WooCommerce',
    icon: '/assets/connectors/woocommerce.svg',
  },
];
