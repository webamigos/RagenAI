// Must stay the first import: it installs the OTel providers and patches
// http/undici before fastmcp — or any outgoing fetch — is evaluated.
import './instrument.js';

import { FastMCP } from 'fastmcp';

import type { RagenSession } from './auth.js';
import { registerBrandingRoutes } from './branding.js';
import { getEnv } from './config/env.js';
import { logger } from './logger.js';
import { serverOptions } from './server-options.js';
import { httpStreamOptions } from './transport.js';
import { registerChatTool } from './tools/chat-tool.js';
import { registerListAssistantsTool } from './tools/list-assistants-tool.js';
import { registerSearchKnowledgeBaseTool } from './tools/search-knowledge-base-tool.js';

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
 * Over HTTP — the default, and the deployment — a single httpStream
 * listener on the one port Railway actually routes public traffic to
 * (`PORT`): both the MCP protocol (`/mcp`) and the
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

const mcp = new FastMCP<RagenSession>(serverOptions(env));

registerBrandingRoutes(mcp);

registerChatTool(mcp);
registerListAssistantsTool(mcp);
registerSearchKnowledgeBaseTool(mcp);

if (env.RAGEN_MCP_TRANSPORT === 'stdio') {
  // One session for the life of the process, on the client's stdin/stdout.
  // Nothing listens on a port, so PORT and /health do not apply.
  await mcp.start({ transportType: 'stdio' });

  logger.info(
    { transport: 'stdio', targetEnv: env.TARGET_ENV },
    '[ragen-mcp] serving MCP over stdio',
  );
} else {
  await mcp.start({
    transportType: 'httpStream',
    // FastMCP's own unhandled-request handler (which now matters — it's what
    // serves the built-in /health endpoint) builds a base URL as
    // `http://${host}`. With host: '::' that's the invalid `http://::`,
    // crashing the process on any non-/mcp request. 0.0.0.0 still binds every
    // IPv4 interface (what Docker/Railway route to) without that bug.
    httpStream: httpStreamOptions(PORT),
  });

  logger.info(
    { port: PORT, targetEnv: env.TARGET_ENV },
    `[ragen-mcp] listening on port ${PORT} (MCP at /mcp, health at /health)`,
  );
}
