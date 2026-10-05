import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { mcpOAuthRules, mcpServiceRules } from '../mcp-oauth';
import { mcpOAuth, mcpService } from '../fragments';
const schema = mcpOAuth
  .merge(mcpService)
  .extend({ SESSION_AUTH_SECRET: z.string().optional() })
  .superRefine((env, ctx) => {
    mcpOAuthRules(env, ctx);
    mcpServiceRules(env, ctx);
  });
describe('MCP OAuth environment', () => {
  it('is off by default', () => {
    expect(schema.parse({}).MCP_OAUTH_ENABLED).toBe('false');
  });
  it('requires both URL and service secret when enabled', () => {
    expect(schema.safeParse({ MCP_OAUTH_ENABLED: 'true' }).success).toBe(false);
  });
  it.each([
    'https://mcp.example/mcp',
    'http://localhost:3300/mcp',
    'http://127.0.0.1:3300/mcp',
  ])('accepts %s', (url) => {
    expect(
      schema.safeParse({
        MCP_OAUTH_ENABLED: 'true',
        RAGEN_MCP_PUBLIC_URL: url,
        MCP_SERVICE_SECRET: 'm'.repeat(32),
      }).success,
    ).toBe(true);
  });
  it.each([
    'not-a-url',
    'http://mcp.example/mcp',
    'https://mcp.example/other',
    Object.assign(new URL('https://mcp.example/mcp'), { username: 'user', password: 'password' }).href,
    'https://mcp.example/mcp?a=b',
    'https://mcp.example/mcp#fragment',
  ])('refuses %s', (url) => {
    expect(
      schema.safeParse({
        MCP_OAUTH_ENABLED: 'true',
        RAGEN_MCP_PUBLIC_URL: url,
        MCP_SERVICE_SECRET: 'm'.repeat(32),
      }).success,
    ).toBe(false);
  });
  it('refuses sharing the session secret even when OAuth is off', () => {
    expect(
      schema.safeParse({
        MCP_SERVICE_SECRET: 'm'.repeat(32),
        SESSION_AUTH_SECRET: 'm'.repeat(32),
      }).success,
    ).toBe(false);
  });
  it('refuses a misspelled deployment switch', () => {
    expect(schema.safeParse({ MCP_OAUTH_ENABLED: 'yes' }).success).toBe(false);
  });
});
