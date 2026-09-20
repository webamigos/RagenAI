/**
 * The connector catalogue, as every app has to agree to read it.
 *
 * `connectors.ts` beside this file answers "which connectors exist" from a
 * compiled-in list, and while the migration in
 * `docs/specs/2026-09-18-mcp-servers-added-without-a-deploy.md` runs, both are
 * true at once. Afterwards the rows are the answer and that list is only the
 * seed's input.
 *
 * **No Prisma here.** This package is imported by `'use client'` components and
 * policed by `client-bundles-stay-browser-safe.test.ts`, so the query that
 * loads these rows is a thin per-app binding — the split `tenant-scope`
 * already uses.
 */
import { CONNECTOR_PROVIDERS } from './connectors';

/**
 * The *shapes* of authentication an entry can use, mirroring the `McpAuthType`
 * Postgres enum. This set stays an enum in the schema because it changes when
 * code changes — unlike the set of services, which is the whole point of the
 * catalogue.
 */
export const MCP_AUTH_TYPES = [
  'SERVER_SIDE',
  'API_KEY_BEARER',
  'EXTERNAL_MCP',
  'API_KEY_CUSTOM_HEADER',
  'OAUTH',
  'API_KEY',
] as const;

export type McpAuthType = (typeof MCP_AUTH_TYPES)[number];

export function isMcpAuthType(value: unknown): value is McpAuthType {
  return (
    typeof value === 'string' &&
    (MCP_AUTH_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Which auth shapes an operator may pick when creating an entry. The other
 * three are seeded only: `API_KEY_CUSTOM_HEADER` needs the user-supplied shop
 * URL path that is out of scope, and `OAUTH` / `API_KEY` predate the manifest
 * shapes that replaced them.
 */
export const OPERATOR_CREATABLE_AUTH_TYPES = [
  'SERVER_SIDE',
  'API_KEY_BEARER',
  'EXTERNAL_MCP',
] as const satisfies readonly McpAuthType[];

export type McpCatalogEntryDto = {
  publicId: string;
  /** See `slug` in the schema: the eleven built-ins SHOUT, new entries do not. */
  slug: string;
  label: string;
  description: string | null;
  /** Brand asset path or uploaded URL. */
  icon: string | null;
  /** Lucide icon name, rendered when there is no brand asset. */
  lucideIcon: string | null;
  /** Null for a built-in, whose behaviour pack reads it from the environment. */
  mcpServerUrl: string | null;
  authType: McpAuthType;
  authBaseUrl: string | null;
  authPath: string | null;
  scopes: string[];
  useUserScope: boolean;
  oauthCredentialsStored: boolean;
  systemPrompt: string | null;
  allowsPrivateAddress: boolean;
  isBuiltIn: boolean;
  enabled: boolean;
};

/**
 * Optional code keyed by slug, for the two things a row cannot hold: a server
 * URL that lives in the environment, and a system prompt that must compute.
 * Each app declares its own packs; this is the shape the resolver needs of
 * them.
 */
export type CatalogBehaviourPack = {
  slug: string;
  /** A built-in's URL, read from the environment at module load. */
  resolveServerUrl?: () => string | undefined;
  resolveAuthBaseUrl?: () => string | undefined;
  /** Google Calendar's fragment takes the user's timezone. */
  systemPromptFragment?: (ctx: SystemPromptContext) => string;
};

export type SystemPromptContext = {
  timeZone: string;
};

/**
 * `API_KEY_CUSTOM_HEADER` assembles its URL from a shop URL the *user* types at
 * connect time, which is code, not a column. Every other shape works from a row
 * alone — that is what lets Notion be a row.
 */
export function authTypeRequiresBehaviourPack(authType: McpAuthType): boolean {
  return authType === 'API_KEY_CUSTOM_HEADER';
}

export const CATALOG_SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * The eleven slugs that are the old `McpConnectorProvider` values verbatim.
 * They are admitted by the seed and the migration and by nothing else: vault
 * token paths, `customerId`s and every `allowedConnectors` array already hold
 * those strings, so renaming them in step would orphan live OAuth tokens.
 */
export const LEGACY_CATALOG_SLUGS: readonly string[] = CONNECTOR_PROVIDERS;

export function isLegacyCatalogSlug(value: unknown): boolean {
  return typeof value === 'string' && LEGACY_CATALOG_SLUGS.includes(value);
}

/** The format required of anything created from now on. */
export function isCatalogSlug(value: unknown): value is string {
  return typeof value === 'string' && CATALOG_SLUG_PATTERN.test(value);
}

/**
 * Why not the looser `^[A-Za-z][A-Za-z0-9_-]*$`: it accepts `Foo_Bar`, a
 * twelfth casing convention in the column whose casing feeds vault paths and
 * `customerId`. The column already holds two by design; a third is the cost
 * this refuses to pay twice.
 */
export function catalogSlugError(value: string): string | null {
  if (value.length === 0) {
    return 'A slug is required.';
  }
  if (value.length > 64) {
    return 'A slug is at most 64 characters.';
  }
  if (!isCatalogSlug(value)) {
    return 'A slug is lowercase letters, digits and hyphens, starting with a letter — for example `notion`.';
  }
  return null;
}

/**
 * The identifier an MCP server is told about, `{orgId}:{userId}:{slug}` with
 * the slug lowercased. Two slugs that differ only in case would produce one
 * `x-customer-id` and hand one server the other's session, which is why the
 * table carries a `lower(slug)` unique index as well as Prisma's `@unique`.
 */
export function catalogCustomerSlug(slug: string): string {
  return slug.toLowerCase();
}

export function slugsCollide(a: string, b: string): boolean {
  return catalogCustomerSlug(a) === catalogCustomerSlug(b);
}

/**
 * A connector's catalogue slug, as read off a row.
 *
 * Since B3 of docs/specs/2026-09-18-mcp-servers-added-without-a-deploy.md
 * `providerSlug` is `NOT NULL` and carries the composite uniqueness, so there
 * is nothing left to fall back to — the `?? provider` that lived here through
 * steps 1 and 2 is gone with the column's nullability.
 *
 * The function stays because the accessor does: every reader goes through it
 * rather than reaching for a column name, so B5's drop touches one file and
 * leaves no reader quietly reading a column that is not there.
 */
export function connectorSlug(row: {
  providerSlug: string;
  /** Unwritten since B3, unread since B2, dropped at B5. */
  provider?: string | null;
}): string {
  return row.providerSlug;
}

export type CatalogResolution<P extends CatalogBehaviourPack> =
  | { status: 'unknown'; slug: string }
  | {
      status: 'resolved';
      entry: McpCatalogEntryDto;
      /** Null is a supported state: an entry with no behaviour pack is a row. */
      pack: P | null;
      /** The address to dial, or null when neither row nor pack names one. */
      serverUrl: string | null;
      authBaseUrl: string | null;
    };

/**
 * `PROVIDER_REGISTRY: Record<McpConnectorProvider, …>` made "every connector
 * has a manifest" a compile error. Nothing about moving to rows brings that
 * back, and this is weaker on purpose: a row with no code is a supported state
 * rather than a crash, because the list is no longer meant to be fixed.
 */
export function resolveCatalogEntry<P extends CatalogBehaviourPack>(
  slug: string,
  entries: readonly McpCatalogEntryDto[],
  packs: Readonly<Record<string, P>>,
): CatalogResolution<P> {
  const entry = entries.find((candidate) => candidate.slug === slug);
  if (!entry) {
    return { status: 'unknown', slug };
  }

  const pack = packs[slug] ?? null;

  return {
    status: 'resolved',
    entry,
    pack,
    // The row wins. A built-in leaves the column null and its pack reads the
    // environment; an operator's entry carries its own and no pack exists.
    serverUrl: entry.mcpServerUrl ?? pack?.resolveServerUrl?.() ?? null,
    authBaseUrl: entry.authBaseUrl ?? pack?.resolveAuthBaseUrl?.() ?? null,
  };
}

/**
 * Whether a resolution can be dialled at all. A disabled entry, an entry whose
 * auth shape needs code that is not there, and an entry nothing names an
 * address for are all "not connectable" rather than an exception — reverting
 * Phase D must not crash a running app, it must stop connecting.
 */
export function isConnectable<P extends CatalogBehaviourPack>(
  resolution: CatalogResolution<P>,
): boolean {
  if (resolution.status === 'unknown') {
    return false;
  }
  if (!resolution.entry.enabled) {
    return false;
  }
  if (
    authTypeRequiresBehaviourPack(resolution.entry.authType) &&
    !resolution.pack
  ) {
    return false;
  }
  // `API_KEY_CUSTOM_HEADER` computes its URL per connector from the shop URL
  // the user types, so it is the one shape with nothing to resolve here.
  if (resolution.entry.authType === 'API_KEY_CUSTOM_HEADER') {
    return true;
  }
  return Boolean(resolution.serverUrl);
}

/**
 * The system prompt fragment for a turn. Text on the row, or a pack's function
 * when the fragment must compute — never both, and never a second branch
 * elsewhere.
 */
export function catalogSystemPrompt<P extends CatalogBehaviourPack>(
  resolution: CatalogResolution<P>,
  ctx: SystemPromptContext,
): string | null {
  if (resolution.status === 'unknown') {
    return null;
  }
  if (resolution.entry.systemPrompt) {
    return resolution.entry.systemPrompt;
  }
  return resolution.pack?.systemPromptFragment?.(ctx) ?? null;
}

/**
 * The two-tier allowlist over the catalogue, unchanged in meaning: empty means
 * no restriction at that tier. A slug an array names but the catalogue no
 * longer carries is filtered out here, as an unknown value already was.
 */
export function allowedCatalogEntries(
  entries: readonly McpCatalogEntryDto[],
  platformAllowed: readonly string[],
  orgAllowed: readonly string[],
): McpCatalogEntryDto[] {
  return entries.filter((entry) => {
    if (!entry.enabled) {
      return false;
    }
    if (platformAllowed.length > 0 && !platformAllowed.includes(entry.slug)) {
      return false;
    }
    if (orgAllowed.length > 0 && !orgAllowed.includes(entry.slug)) {
      return false;
    }
    return true;
  });
}
