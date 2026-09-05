/* eslint-disable no-console -- startup/health logging, before any request-scoped logger exists */
import { serve } from '@hono/node-server';
import { FastMCP } from 'fastmcp';
import { Hono } from 'hono';

import { authenticate } from './auth.js';
import { registerChatTool } from './tools/chat-tool.js';

/**
 * Two separate listeners, matching the ragen-connectors MCP services'
 * convention (google/clickup/hubspot/rejestrio): a small Hono app for
 * plain HTTP concerns (just a health check here — no OAuth callback to
 * serve, unlike those services, since this one authenticates callers with
 * their own existing Ragen API key rather than a per-provider OAuth flow),
 * and FastMCP's own httpStream transport for the actual MCP protocol, on
 * HTTP_PORT + 1000.
 */
const HTTP_PORT = parseInt(process.env.PORT ?? '3300', 10);
const MCP_PORT = HTTP_PORT + 1000;

const app = new Hono();
app.get('/health', (c) => c.json({ status: 'ok', server: 'Ragen MCP' }));

serve({ fetch: app.fetch, hostname: '::', port: HTTP_PORT }, (info) => {
  console.log(`[ragen-mcp] HTTP (health) listening on port ${info.port}`);
});

const mcp = new FastMCP({
  name: 'Ragen',
  version: '0.0.1',
  authenticate,
});

registerChatTool(mcp);

await mcp.start({
  transportType: 'httpStream',
  httpStream: { host: '::', port: MCP_PORT },
});

console.log(`[ragen-mcp] MCP (httpStream) listening on port ${MCP_PORT}`);
