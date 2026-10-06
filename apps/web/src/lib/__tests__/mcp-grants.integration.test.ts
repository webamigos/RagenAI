vi.mock(
  '@/features/organizations/services/queries/get-mcp-connection-labels-query',
  () => ({
    getMcpConnectionLastUse: vi.fn(async () => null),
    getMcpConnectionLabels: vi.fn(async () => ({
      organizationName: 'Workspace',
      assistantName: null,
    })),
  }),
);
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { expect, it, vi } from 'vitest';
import { mcpOAuthPlugins } from '../mcp-oauth-config';

it('requires a session and revokes only its own client grants through the real handler', async () => {
  const data: Record<string, Record<string, unknown>[]> = Object.fromEntries(
    [
      'user',
      'session',
      'account',
      'verification',
      'oauthClient',
      'oauthResource',
      'oauthClientResource',
      'oauthConsent',
      'oauthRefreshToken',
      'oauthAccessToken',
      'oauthClientAssertion',
      'jwks',
    ].map((model) => [model, []]),
  );
  const auth = betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'disconnect-test-secret-at-least-32-characters',
    database: memoryAdapter(data),
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    emailAndPassword: { enabled: true },
    plugins: [
      ...mcpOAuthPlugins({
        MCP_OAUTH_ENABLED: 'true',
        RAGEN_MCP_PUBLIC_URL: 'https://mcp.example/mcp',
      }),
    ],
  });
  const signup = await auth.api.signUpEmail({
    body: {
      email: 'disconnect@example.com',
      password: 'test-password-123',
      name: 'Disconnect test',
    },
    asResponse: true,
  });
  expect(signup.status).toBe(200);
  const result = await signup.json();
  const cookie = signup.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const userId = result.user.id;
  const scopes = ['mcp:read'];
  const grant = (id: string, userId: string, clientId: string) => ({
    id,
    userId,
    clientId,
    scopes,
    resources: ['https://mcp.example/mcp'],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  data.oauthConsent.push(
    grant('own', userId, 'app'),
    grant('foreign', 'other-user', 'app'),
    grant('other-app', userId, 'other-app'),
  );
  for (const model of ['oauthRefreshToken', 'oauthAccessToken'])
    data[model].push(
      grant('own-token', userId, 'app'),
      grant('foreign-token', 'other-user', 'app'),
      grant('other-app-token', userId, 'other-app'),
    );
  const disconnect = (
    consentId: string,
    sessionCookie?: string,
    origin = 'http://localhost:3000',
  ) =>
    auth.handler(
      new Request('http://localhost:3000/api/auth/mcp/disconnect', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          ...(sessionCookie ? { cookie: sessionCookie } : {}),
        },
        body: JSON.stringify({ consentId }),
      }),
    );
  const list = (sessionCookie?: string) =>
    auth.handler(
      new Request('http://localhost:3000/api/auth/mcp/apps', {
        headers: sessionCookie ? { cookie: sessionCookie } : {},
      }),
    );
  expect((await list()).status).toBe(401);
  const listed = await list(cookie);
  expect(listed.status).toBe(200);
  const apps = await listed.json();
  expect(
    apps.map((app: { consentId: string }) => app.consentId).sort(),
  ).toEqual(['other-app', 'own']);
  expect(Object.keys(apps[0]).sort()).toEqual([
    'assistantName',
    'clientId',
    'connectedAt',
    'consentId',
    'lastUsedAt',
    'name',
    'organizationName',
    'referenceId',
  ]);
  expect((await disconnect('own')).status).toBe(401);
  expect((await disconnect('foreign', cookie)).status).toBe(404);
  expect(
    (await disconnect('own', cookie, 'https://attacker.example')).status,
  ).toBe(403);
  expect(data.oauthConsent).toHaveLength(3);
  expect((await disconnect('own', cookie)).status).toBe(200);
  expect(data.oauthConsent.map((row) => row.id)).toEqual([
    'foreign',
    'other-app',
  ]);
  for (const model of ['oauthRefreshToken', 'oauthAccessToken'])
    expect(data[model].map((row) => row.id)).toEqual([
      'foreign-token',
      'other-app-token',
    ]);
});
