import {
  CONNECTOR_METADATA,
  type ConnectorProvider,
} from '@ragenai/platform-contracts';
import type { ProviderDefinition } from '../contracts/connector.types';
import { PROVIDER_LIST } from './registry';

/**
 * A dependency-free description of the eleven connectors that predate the
 * catalogue table, written to `prisma/catalog/built-in-connectors.json` by
 * `apps/web/scripts/write-connector-projection.ts`.
 *
 * The seed reads the JSON, never this module. `PROVIDER_LIST` pulls in every
 * manifest, `shared-config.ts` reads server URLs from `process.env` at module
 * load, and the HubSpot and Slack manifests read OAuth client ids and secrets
 * the same way — so a seed runner that imported it would fail without the web
 * alias, the generated Prisma module graph and those variables, and would fail
 * while holding secrets it had no reason to load.
 *
 * `built-in-projection.test.ts` compares the committed JSON against this
 * function, so the two cannot drift. That comparison belongs in CI, not in the
 * migration path.
 */
export type BuiltInCatalogEntry = {
  /** The current `McpConnectorProvider` value, verbatim. */
  slug: string;
  label: string;
  description: string;
  /** Brand asset under each app's `public/`. */
  icon: string;
  /** Lucide icon name, rendered when there is no brand asset. */
  lucideIcon: string;
  authType:
    | 'SERVER_SIDE'
    | 'API_KEY_BEARER'
    | 'EXTERNAL_MCP'
    | 'API_KEY_CUSTOM_HEADER'
    | 'OAUTH'
    | 'API_KEY';
  authPath: string | null;
  scopes: string[];
  useUserScope: boolean;
  /**
   * Null when the manifest's fragment is a function — Google Calendar's takes
   * the user's timezone. Rows hold text; functions stay in a behaviour pack.
   */
  systemPrompt: string | null;
};

/**
 * `ProviderDefinition.authType` is optional and several paths branch on it
 * being undefined. A manifest with no authType projects to `SERVER_SIDE`,
 * which is what those paths already do in effect — stated rather than
 * inherited, because "unset" is not an auth shape.
 */
export function projectAuthType(
  authType: ProviderDefinition['authType'],
): BuiltInCatalogEntry['authType'] {
  if (!authType) {
    return 'SERVER_SIDE';
  }
  return authType.toUpperCase() as BuiltInCatalogEntry['authType'];
}

export function projectProvider(def: ProviderDefinition): BuiltInCatalogEntry {
  const slug = def.provider as ConnectorProvider;
  return {
    slug,
    label: def.name,
    description: def.description,
    icon: CONNECTOR_METADATA[slug].icon,
    lucideIcon: def.icon,
    authType: projectAuthType(def.authType),
    authPath: def.authPath ?? null,
    scopes: def.scopes ?? [],
    useUserScope: def.useUserScope ?? false,
    systemPrompt:
      typeof def.systemPromptFragment === 'string'
        ? def.systemPromptFragment
        : null,
  };
}

/**
 * Deliberately omits every URL. `mcpServerUrl` and `authBaseUrl` are read from
 * the environment at module load with fallbacks, and every deployment sets
 * them; writing the current value into a seeded row would mean a database
 * promoted or restored between environments silently points Google at the
 * wrong host. Built-in rows leave both null and their behaviour pack resolves
 * them.
 */
export function projectBuiltInCatalogue(): BuiltInCatalogEntry[] {
  return PROVIDER_LIST.map(projectProvider);
}
