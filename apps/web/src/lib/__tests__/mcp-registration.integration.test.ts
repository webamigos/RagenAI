import { describe, expect, it } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createAuthMiddleware } from 'better-auth/api';
import { mcpOAuthPlugins } from '../mcp-oauth-config';
import {
  assertMcpRegistrationRedirects,
  MCP_REGISTRATION_RATE_LIMIT,
} from '../mcp-registration';

describe('MCP registration limiter on the real auth handler', () => {
  it('limits one IP without exhausting another IP budget', async () => {
    const server = betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'registration-test-secret-at-least-32-characters',
      database: memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
        oauthClient: [],
        oauthResource: [],
        oauthClientResource: [],
        oauthConsent: [],
        oauthRefreshToken: [],
        oauthAccessToken: [],
        oauthClientAssertion: [],
        jwks: [],
      }),
      plugins: [
        ...mcpOAuthPlugins({
          MCP_OAUTH_ENABLED: 'true',
          RAGEN_MCP_PUBLIC_URL: 'https://mcp.example/mcp',
        }),
      ],
      advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
      rateLimit: {
        enabled: true,
        customRules: { '/oauth2/register': MCP_REGISTRATION_RATE_LIMIT },
      },
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          if (ctx.path === '/oauth2/register') {
            assertMcpRegistrationRedirects(ctx.body);
          }
        }),
      },
    });
    const register = (ip: string) =>
      server.handler(
        new Request('http://localhost:3000/api/auth/oauth2/register', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': ip,
          },
          body: JSON.stringify({
            client_name: 'Limiter test',
            redirect_uris: ['https://client.example/callback'],
            token_endpoint_auth_method: 'none',
            grant_types: ['authorization_code'],
            response_types: ['code'],
            scope: 'mcp:read',
          }),
        }),
      );
    for (let index = 0; index < MCP_REGISTRATION_RATE_LIMIT.max; index++) {
      expect((await register('192.0.2.42')).status).toBe(201);
    }
    const limited = await register('192.0.2.42');
    expect(limited.status).toBe(429);
    expect((await register('192.0.2.43')).status).toBe(201);
  });
});
