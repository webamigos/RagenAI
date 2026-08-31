// Ported verbatim from ragen-app's
// src/features/connectors/providers/shared-config.ts. See
// docs/adrs/21-monorepo-and-api-decoupling.md.

export const MCP_GOOGLE_SERVER_URL =
  process.env.MCP_GOOGLE_SERVER_URL || 'http://localhost:8000';
export const MCP_GOOGLE_AUTH_URL =
  process.env.MCP_GOOGLE_AUTH_URL || MCP_GOOGLE_SERVER_URL;

export const MCP_CLICKUP_SERVER_URL =
  process.env.MCP_CLICKUP_SERVER_URL || 'https://mcp.clickup.com/mcp';
export const MCP_HUBSPOT_SERVER_URL =
  process.env.MCP_HUBSPOT_SERVER_URL || 'https://mcp.hubspot.com';
export const MCP_FIREFLIES_SERVER_URL =
  process.env.MCP_FIREFLIES_SERVER_URL || 'https://api.fireflies.ai/mcp';
export const MCP_SLACK_SERVER_URL =
  process.env.MCP_SLACK_SERVER_URL || 'https://mcp.slack.com/mcp';
export const MCP_REJESTRIO_SERVER_URL =
  process.env.MCP_REJESTRIO_SERVER_URL || 'http://localhost:9004/mcp';
