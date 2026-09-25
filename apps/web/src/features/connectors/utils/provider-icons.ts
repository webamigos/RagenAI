import { CONNECTOR_ICON_PATHS } from '@ragenai/platform-contracts';

/**
 * Catalogue slug → the SVG asset that represents that brand.
 *
 * The paths live in `@ragenai/platform-contracts` (ADR-33) so the admin panel's
 * connector allowlist renders the same icons.
 *
 * Keyed by `string`. The annotation used to be
 * `Record<McpConnectorProvider, string>` and that was load-bearing — it failed
 * typecheck if the package was missing a provider the schema's enum had. The
 * catalogue is rows now and the enum is gone, so an entry added from the admin
 * panel has no asset here at all: its icon comes off its row. What the
 * annotation protected is covered instead by
 * `every-seeded-connector-resolves.test.ts`, which checks the eleven seeded
 * entries have their brand asset on disk in both apps that render one.
 */
export const PROVIDER_ICON_PATHS: Record<string, string> = CONNECTOR_ICON_PATHS;

/**
 * MCP tool names are prefixed with the provider slug using `__` as
 * separator — e.g. `clickup__create_task`, `google_calendar__
 * gcal_create_event`. Split and UPPERCASE to match the enum shape the
 * icon map is keyed by. Unknown / malformed names return null so the
 * caller can render a fallback.
 */
export function providerFromToolName(toolName: string): string | null {
  const prefix = toolName.split('__')[0];
  if (!prefix) {
    return null;
  }
  const slug = prefix.toUpperCase();
  return slug in PROVIDER_ICON_PATHS ? slug : null;
}

export function iconPathForProvider(provider: string | null): string | null {
  if (!provider) {
    return null;
  }
  return PROVIDER_ICON_PATHS[provider] ?? null;
}

/**
 * A connector's brand asset: its catalogue row's, else the built-in map's.
 * The one answer every connector view gives — the row first, because an
 * entry added from the admin panel exists only there.
 */
export function connectorIconUrl(
  provider: string | null,
  iconUrl?: string | null,
): string | null {
  if (iconUrl) {
    return iconUrl;
  }
  return iconPathForProvider(provider);
}
