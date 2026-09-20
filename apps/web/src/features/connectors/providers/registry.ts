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
import { SLACK_PROVIDER } from './slack';
import { WOOCOMMERCE_PROVIDER } from './woocommerce';
import { OPEN_MERCATO_PROVIDER } from './open-mercato';

/**
 * Behaviour packs, keyed by catalogue slug.
 *
 * This used to be `Record<McpConnectorProvider, ProviderDefinition>`, and that
 * annotation was the guarantee that every connector had a manifest: a missing
 * entry was a compile error. The enum is gone and nothing brings that
 * guarantee back — see
 * docs/specs/2026-09-18-mcp-servers-added-without-a-deploy.md.
 *
 * What replaces it is deliberately weaker, because the list is no longer meant
 * to be fixed: a runtime lookup that answers "no behaviour pack" rather than
 * crashing, and `tests/architecture/every-seeded-connector-resolves.test.ts`
 * from the other direction. **A connector with no code here is a supported
 * state** — that is the whole point of the catalogue. A pack exists for the
 * two things a row cannot hold: a system prompt that must compute, and the
 * `api_key_custom_header` URL assembly.
 */
export const PROVIDER_REGISTRY: Record<string, ProviderDefinition> =
  Object.fromEntries(
    [
      GOOGLE_CALENDAR_PROVIDER,
      GOOGLE_ANALYTICS_PROVIDER,
      GOOGLE_ADS_PROVIDER,
      GOOGLE_DRIVE_PROVIDER,
      GMAIL_PROVIDER,
      CLICKUP_PROVIDER,
      HUBSPOT_PROVIDER,
      FIREFLIES_PROVIDER,
      SLACK_PROVIDER,
      WOOCOMMERCE_PROVIDER,
      OPEN_MERCATO_PROVIDER,
    ].map((definition) => [definition.provider, definition]),
  );

export const PROVIDER_LIST: readonly ProviderDefinition[] =
  Object.values(PROVIDER_REGISTRY);

/**
 * The behaviour pack for a catalogue slug, or `undefined` when none carries it
 * — an entry an operator added has no code at all.
 */
export function getProvider(provider: string): ProviderDefinition | undefined {
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
    iconUrl: def.iconUrl ?? null,
    mcpServerUrl: def.mcpServerUrl,
    authBaseUrl: def.authBaseUrl,
    authPath: def.authPath,
    authType: def.authType,
    apiKeyHelpUrl: def.apiKeyHelpUrl,
    scopes: def.scopes,
    singleTokenAuth: def.singleTokenAuth,
  };
}

export const PUBLIC_PROVIDER_LIST: readonly PublicProviderDto[] =
  PROVIDER_LIST.map(toPublicProviderDto);
