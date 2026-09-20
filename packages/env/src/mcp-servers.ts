/**
 * Where a built-in connector's MCP server lives, described once.
 *
 * Five variables name the servers the eleven compiled-in connectors talk to,
 * and until now they were read in two places — `shared-config.ts` in `apps/web`
 * and a file in `apps/api` whose header says "ported verbatim". The connector
 * catalogue adds a third reader: `apps/admin` renders an entry's resolved
 * server URL, and a built-in's URL is deliberately *not* a column (see the
 * `McpCatalogEntry` comments — a database promoted between environments would
 * otherwise silently point Google at the wrong host).
 *
 * So the seam is data here, per ADR-37, and the apps derive from it.
 * `tests/architecture/built-in-mcp-server-urls-agree.test.ts` holds the two
 * existing copies to it until they are migrated.
 */

/** Slug → the variable that names its server, and the default if it is unset. */
export const BUILT_IN_MCP_SERVERS = {
  GOOGLE_CALENDAR: {
    variable: 'MCP_GOOGLE_SERVER_URL',
    fallback: 'http://localhost:8000',
  },
  GOOGLE_ANALYTICS: {
    variable: 'MCP_GOOGLE_SERVER_URL',
    fallback: 'http://localhost:8000',
  },
  GOOGLE_ADS: {
    variable: 'MCP_GOOGLE_SERVER_URL',
    fallback: 'http://localhost:8000',
  },
  GOOGLE_DRIVE: {
    variable: 'MCP_GOOGLE_SERVER_URL',
    fallback: 'http://localhost:8000',
  },
  GMAIL: {
    variable: 'MCP_GOOGLE_SERVER_URL',
    fallback: 'http://localhost:8000',
  },
  CLICKUP: {
    variable: 'MCP_CLICKUP_SERVER_URL',
    fallback: 'https://mcp.clickup.com/mcp',
  },
  HUBSPOT: {
    variable: 'MCP_HUBSPOT_SERVER_URL',
    fallback: 'https://mcp.hubspot.com',
  },
  FIREFLIES: {
    variable: 'MCP_FIREFLIES_SERVER_URL',
    fallback: 'https://api.fireflies.ai/mcp',
  },
  SLACK: {
    variable: 'MCP_SLACK_SERVER_URL',
    fallback: 'https://mcp.slack.com/mcp',
  },
  /**
   * WooCommerce and Open Mercato are absent on purpose: their URL is assembled
   * per connector from the shop URL the *user* types at connect time, so there
   * is no deployment-wide address for either.
   */
} as const;

export type BuiltInMcpSlug = keyof typeof BUILT_IN_MCP_SERVERS;

/**
 * The authorization host for the Google connectors, which reach their OAuth
 * flow through the same container unless `MCP_GOOGLE_AUTH_URL` says otherwise.
 */
export const MCP_GOOGLE_AUTH_VARIABLE = 'MCP_GOOGLE_AUTH_URL';

const GOOGLE_SLUGS: readonly string[] = [
  'GOOGLE_CALENDAR',
  'GOOGLE_ANALYTICS',
  'GOOGLE_ADS',
  'GOOGLE_DRIVE',
  'GMAIL',
];

export function isBuiltInMcpSlug(slug: string): slug is BuiltInMcpSlug {
  return slug in BUILT_IN_MCP_SERVERS;
}

/**
 * A blank variable means unset, as everywhere else in this package: a Railway
 * variable someone cleared and a `FOO=` line in a compose file are both real
 * deploy shapes, and neither means "the empty string".
 */
function read(
  env: Record<string, string | undefined>,
  variable: string,
): string | undefined {
  const value = env[variable];
  return value && value.trim() !== '' ? value : undefined;
}

export function resolveBuiltInMcpServerUrl(
  slug: string,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  if (!isBuiltInMcpSlug(slug)) {
    return undefined;
  }
  const { variable, fallback } = BUILT_IN_MCP_SERVERS[slug];
  return read(env, variable) ?? fallback;
}

export function resolveBuiltInMcpAuthUrl(
  slug: string,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  if (!GOOGLE_SLUGS.includes(slug)) {
    return undefined;
  }
  return (
    read(env, MCP_GOOGLE_AUTH_VARIABLE) ?? resolveBuiltInMcpServerUrl(slug, env)
  );
}
