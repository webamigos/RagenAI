import type { McpConnectorProvider } from '@/generated/prisma/client';
import { CONNECTOR_ICON_PATHS } from '@ragenai/platform-contracts';

/**
 * Enum value → the SVG asset that represents that brand.
 *
 * The paths live in `@ragenai/platform-contracts` (ADR-33) so the admin panel's
 * connector allowlist renders the same icons. The annotation below is what
 * makes that safe: assigning the shared map into a `Record` keyed by *this
 * app's generated enum* fails typecheck if the package is missing a provider
 * the schema has. (The other direction — an extra key in the package — is
 * covered by the package's own test against `schema.prisma`.)
 *
 * New providers add an entry to the package AND a matching SVG under
 * `public/assets/connectors/` in both apps.
 */
export const PROVIDER_ICON_PATHS: Record<McpConnectorProvider, string> =
  CONNECTOR_ICON_PATHS;

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
