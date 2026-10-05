import { test, expect } from '@playwright/test';

const enabled = process.env.MCP_OAUTH_ENABLED === 'true';

test('MCP discovery stays at the origin root and follows the deployment gate', async ({
  request,
}) => {
  for (const document of [
    'oauth-authorization-server',
    'openid-configuration',
  ]) {
    const response = await request.get(`/.well-known/${document}`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(enabled ? 200 : 404);
    expect(response.headers().location).toBeUndefined();
    if (enabled) {
      const metadata = await response.json();
      expect(metadata.issuer).toBeTruthy();
      expect(metadata.authorization_endpoint).toContain(
        '/api/auth/oauth2/authorize',
      );
      expect(metadata.token_endpoint).toContain('/api/auth/oauth2/token');
      expect(metadata.registration_endpoint).toContain(
        '/api/auth/oauth2/register',
      );
      expect(metadata.code_challenge_methods_supported).toContain('S256');
    }
  }
});

test('MCP dynamic registration refuses unsafe redirects and accepts native loopback', async ({
  request,
}) => {
  test.skip(!enabled, 'Authorization server is disabled');
  const registration = '/api/auth/oauth2/register';
  for (const redirectUri of [
    'http://evil.example/callback',
    'javascript:alert(1)',
    'https://client.example/callback#fragment',
  ]) {
    const response = await request.post(registration, {
      data: {
        client_name: 'E2E policy check',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
      },
    });
    expect(response.status()).toBe(400);
  }
  const webLoopback = await request.post(registration, {
    data: {
      client_name: 'E2E invalid web client',
      application_type: 'web',
      redirect_uris: ['http://localhost:43210/callback'],
      token_endpoint_auth_method: 'none',
    },
  });
  expect(webLoopback.status()).toBe(400);
  const native = await request.post(registration, {
    data: {
      client_name: 'E2E native client',
      application_type: 'native',
      redirect_uris: ['http://localhost:43210/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'openid offline_access mcp:read',
    },
  });
  expect(native.status()).toBe(201);
  expect((await native.json()).client_id).toBeTruthy();
});
