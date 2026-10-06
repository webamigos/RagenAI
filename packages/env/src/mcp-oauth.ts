import { type z } from 'zod';

export function mcpOAuthRules(
  env: { MCP_OAUTH_ENABLED: string; RAGEN_MCP_PUBLIC_URL?: string },
  ctx: z.RefinementCtx,
): void {
  if (env.MCP_OAUTH_ENABLED !== 'true') {
    return;
  }
  if (!env.RAGEN_MCP_PUBLIC_URL) {
    ctx.addIssue({
      code: 'custom',
      path: ['RAGEN_MCP_PUBLIC_URL'],
      message: 'Required when MCP_OAUTH_ENABLED=true',
    });
    return;
  }
  let url: URL;
  try {
    url = new URL(env.RAGEN_MCP_PUBLIC_URL);
  } catch {
    ctx.addIssue({
      code: 'custom',
      path: ['RAGEN_MCP_PUBLIC_URL'],
      message: 'Use a valid public MCP URL',
    });
    return;
  }
  if (
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/mcp'
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['RAGEN_MCP_PUBLIC_URL'],
      message:
        'Use the public HTTPS /mcp endpoint (HTTP only on loopback), without credentials, query or fragment',
    });
  }
}
export function mcpServiceRules(
  env: {
    MCP_OAUTH_ENABLED: string;
    MCP_SERVICE_SECRET?: string;
    SESSION_AUTH_SECRET?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    env.MCP_SERVICE_SECRET &&
    env.MCP_SERVICE_SECRET === env.SESSION_AUTH_SECRET
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['MCP_SERVICE_SECRET'],
      message: 'Must differ from SESSION_AUTH_SECRET',
    });
  }
  if (env.MCP_OAUTH_ENABLED === 'true' && !env.MCP_SERVICE_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['MCP_SERVICE_SECRET'],
      message: 'Required when MCP_OAUTH_ENABLED=true',
    });
  }
}
