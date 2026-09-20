import { CONNECTOR_ICON_PATHS } from '@ragenai/platform-contracts';

/**
 * Catalogue slug → the SVG asset that represents that brand.
 *
 * The paths live in `@ragenai/platform-contracts` (ADR-33) so the admin panel's
 * connector allowlist renders the same icons.
 *
 * Keyed by `string`, not by the generated enum. The annotation used to be
 * `Record<McpConnectorProvider, string>` and that was load-bearing — it failed
 * typecheck if the package was missing a provider the schema had — but the
 * catalogue is rows now, and an entry added from the admin panel has no enum
 * member and no asset here. Its icon comes off its row. What the annotation
 * was protecting is still covered from the other side, by the package's own
 * test against `schema.prisma`, until the enum goes.
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
