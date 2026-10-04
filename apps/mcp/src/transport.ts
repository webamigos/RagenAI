/**
 * The two ways this server can be reached.
 *
 * `http` is the deployment: one streamable-HTTP listener at `/mcp`, every
 * caller authenticated by the Bearer key it sends. `stdio` is for a client
 * that starts the server as a child process and speaks JSON-RPC over its
 * stdin/stdout — a local MCP client, and Glama, whose directory inspection
 * runs `initialize` and `tools/list` through `mcp-proxy` and can reach no
 * other transport.
 */
export const MCP_TRANSPORTS = ['http', 'stdio'] as const;

export type McpTransport = (typeof MCP_TRANSPORTS)[number];

/**
 * Read straight from the environment rather than from `getEnv()`, because the
 * two callers run before the environment is parsed: instrument.ts is the
 * first import, and the logger is constructed at module scope. Over stdio,
 * stdout *is* the protocol, so both have to know where not to write before
 * anything is written at all.
 */
export function isStdioTransport(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.RAGEN_MCP_TRANSPORT === 'stdio';
}
