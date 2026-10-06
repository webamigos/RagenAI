import { fragments, mcpOAuthRules, parseEnv } from '@ragenai/env';

export async function mcpDiscovery(
  request: Request,
  document: 'oauth-authorization-server' | 'openid-configuration',
  handler: (request: Request) => Promise<Response>,
  source: Record<string, string | undefined> = process.env,
): Promise<Response> {
  const config = parseEnv(
    fragments.mcpOAuth.superRefine(mcpOAuthRules),
    source,
  );
  if (!config.ok || config.env.MCP_OAUTH_ENABLED !== 'true') {
    return new Response(null, { status: 404 });
  }
  const url = new URL(request.url);
  url.pathname = `/api/auth/.well-known/${document}`;
  return handler(new Request(url, request));
}
