import type { FastMCP } from 'fastmcp';

import { authenticate, type RagenSession } from './auth.js';
import type { McpEnv } from './config/env.js';
import { fastmcpLogger } from './fastmcp-logger.js';

type ServerOptions = ConstructorParameters<typeof FastMCP<RagenSession>>[0];

/**
 * The options the Ragen MCP server is constructed with — apart from index.ts
 * so a test can start the real server and read its initialize response.
 */
export function serverOptions(
  env: Pick<McpEnv, 'SERVER_VERSION'>,
): ServerOptions {
  return {
    name: 'Ragen',
    // FastMCP types this as `${number}.${number}.${number}`, but passes it
    // through untouched, and the MCP spec's `serverInfo.version` is any
    // string. A commit SHA or `dev` is the honest answer for a build that was
    // not a release; a made-up semver would not be.
    version: env.SERVER_VERSION as ServerOptions['version'],
    authenticate,
    // Without this FastMCP's own output goes straight to console — unstructured,
    // and invisible to the OTel logs bridge.
    logger: fastmcpLogger,
  };
}
