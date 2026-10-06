import { randomUUID } from 'node:crypto';
import { test, expect, request as apiRequest } from '@playwright/test';
import db from '../src/libs/db';
import { runMcpClientMaintenance } from '../src/lib/run-mcp-client-maintenance';
import { TEST_USER_ID } from './constants';

test('MCP retention removes old anonymous DCR clients and preserves recent, owned and consented clients', async ({
  baseURL,
}) => {
  test.skip(
    process.env.MCP_OAUTH_ENABLED !== 'true',
    'Enable the OAuth maintenance gate',
  );
  expect(new URL(process.env.DATABASE_URL!).pathname).toBe('/ragen_e2e');
  const prefix = `retention-${randomUUID()}`;
  const ids = ['unused', 'recent', 'owned', 'consented'].map(
    (name) => `${prefix}-${name}`,
  );
  const now = new Date();
  const old = new Date(now.getTime() - 31 * 86_400_000);
  const request = await apiRequest.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  let registeredClientId: string | undefined;
  try {
    const registration = await request.post('/api/auth/oauth2/register', {
      data: {
        client_name: 'Retention DCR test',
        redirect_uris: ['https://client.example/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: 'openid offline_access mcp:read',
      },
    });
    expect(registration.status()).toBe(201);
    registeredClientId = (await registration.json()).client_id;
    expect(registeredClientId).toBeTruthy();
    await db.oauthClient.update({
      where: { clientId: registeredClientId },
      data: { createdAt: old },
    });
    for (const [index, id] of ids.entries()) {
      await db.oauthClient.create({
        data: {
          id,
          clientId: id,
          createdAt: index === 1 ? now : old,
          userId: index === 2 ? TEST_USER_ID : null,
          scopes: [],
          contacts: [],
          redirectUris: ['https://client.example/callback'],
          postLogoutRedirectUris: [],
          grantTypes: ['authorization_code'],
          responseTypes: ['code'],
        },
      });
    }
    await db.oauthConsent.create({
      data: {
        id: `${prefix}-consent`,
        clientId: ids[3],
        userId: TEST_USER_ID,
        resources: [],
        requestedUserInfoClaims: [],
        scopes: ['mcp:read'],
        createdAt: now,
        updatedAt: now,
      },
    });
    expect((await runMcpClientMaintenance(now)).deleted).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      await db.oauthClient.findUnique({ where: { clientId: ids[0] } }),
    ).toBeNull();
    expect(
      await db.oauthClient.findUnique({
        where: { clientId: registeredClientId },
      }),
    ).toBeNull();
    for (const clientId of ids.slice(1)) {
      expect(
        await db.oauthClient.findUnique({ where: { clientId } }),
      ).not.toBeNull();
    }
    expect(
      await db.oauthConsent.findUnique({ where: { id: `${prefix}-consent` } }),
    ).not.toBeNull();
    await runMcpClientMaintenance(now);
    expect(
      await db.oauthClient.count({ where: { clientId: { in: ids } } }),
    ).toBe(3);
  } finally {
    await db.oauthClient.deleteMany({
      where: {
        clientId: {
          in: [...ids, ...(registeredClientId ? [registeredClientId] : [])],
        },
      },
    });
    await request.dispose();
    await db.$disconnect();
  }
});
