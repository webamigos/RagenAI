// Must stay the first import: it installs the OTel providers and patches
// http/undici before fastmcp — or any outgoing fetch — is evaluated.
import './instrument.js';

import { FastMCP } from 'fastmcp';

import { authenticate } from './auth.js';
import { getEnv } from './env.js';
import { fastmcpLogger } from './fastmcp-logger.js';
import { logger } from './logger.js';
import { registerChatTool } from './tools/chat-tool.js';
import { registerListAssistantsTool } from './tools/list-assistants-tool.js';

// Before anything else that reads configuration: a bad environment should
// produce one legible block at boot, not a connection failure on the first
// tool call (ADR-37).
//
// console, not the logger that exists three lines up. A boot failure wants
// the dumbest reliable output path there is: this exits immediately, and
// pino's stream and the OTel batch processor both hold records that a
// process.exit can drop. The same reasoning is written down in
// apps/worker/src/worker.ts.
let env;
try {
  env = getEnv();
} catch (error) {
  // eslint-disable-next-line no-console -- see above
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

/**
 * A single httpStream listener on the one port Railway actually routes
 * public traffic to (`PORT`) — both the MCP protocol (`/mcp`) and the
 * health check (`/health`, FastMCP's own built-in endpoint, enabled by
 * default) are served from it.
 *
 * An earlier version ran two separate listeners — a small Hono app for
 * `/health` on `PORT`, FastMCP on `PORT + 1000` — matching
 * ragen-connectors' convention. That works for ragen-connectors because
 * their callers (apps/web) reach them over Railway's *private* network,
 * which isn't limited to one port. apps/mcp's callers are external MCP
 * clients (Claude Desktop, Cursor) on the public internet, reachable only
 * through Railway's public domain, which only forwards to the container's
 * single routed port — so the two-port split would have made `/mcp`
 * unreachable in production despite `/health` passing.
 */
const PORT = env.PORT;

const mcp = new FastMCP({
  name: 'Ragen',
  version: '0.0.1',
  authenticate,
  // Without this FastMCP's own output goes straight to console — unstructured,
  // and invisible to the OTel logs bridge.
  logger: fastmcpLogger,
});

registerChatTool(mcp);
registerListAssistantsTool(mcp);

await mcp.start({
  transportType: 'httpStream',
  // FastMCP's own unhandled-request handler (which now matters — it's what
  // serves the built-in /health endpoint) builds a base URL as
  // `http://${host}`. With host: '::' that's the invalid `http://::`,
  // crashing the process on any non-/mcp request. 0.0.0.0 still binds every
  // IPv4 interface (what Docker/Railway route to) without that bug.
  httpStream: { host: '0.0.0.0', port: PORT },
});

logger.info(
  { port: PORT, targetEnv: env.TARGET_ENV },
  `[ragen-mcp] listening on port ${PORT} (MCP at /mcp, health at /health)`,
);
