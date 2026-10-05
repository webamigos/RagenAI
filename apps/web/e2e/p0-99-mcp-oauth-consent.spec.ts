import { test, expect, request as apiRequest } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLocalJWKSet, jwtVerify } from 'jose';
import {
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_USER_ID,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from './constants';

test('MCP authorization binds a verified JWT to the selected workspace and rechecks refresh permissions', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000);
  test.skip(
    process.env.MCP_OAUTH_ENABLED !== 'true',
    'Enable the authorization server for the OAuth gate',
  );
  const database = new URL(process.env.DATABASE_URL!);
  expect(database.pathname).toBe('/ragen_e2e');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const settings = await prisma.organizationSettings.findUniqueOrThrow({
    where: { organizationId: TEST_ORG_ID },
  });
  const original = settings.featureOverrides;
  const features =
    original && typeof original === 'object' && !Array.isArray(original)
      ? original
      : {};
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const request = await apiRequest.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    await prisma.organizationSettings.update({
      where: { organizationId: TEST_ORG_ID },
      data: { featureOverrides: { ...features, mcpOAuth: true } },
    });
    const registration = await request.post('/api/auth/oauth2/register', {
      data: {
        client_name: 'MCP consent test',
        redirect_uris: ['https://client.example/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: 'openid offline_access mcp:read',
      },
    });
    if (registration.status() !== 201) {
      throw new Error(
        `Registration failed (${registration.status()}): ${await registration.text()}`,
      );
    }
    expect(registration.status()).toBe(201);
    const client = await registration.json();
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const resource = process.env.RAGEN_MCP_PUBLIC_URL!;
    const query = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: 'https://client.example/callback',
      response_type: 'code',
      scope: 'openid offline_access mcp:read',
      resource,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'consent-test-state',
    });
    const page = await context.newPage();
    await page.route('https://client.example/**', (route) =>
      route.fulfill({ body: 'Connected' }),
    );
    await page.goto(`${baseURL}/api/auth/oauth2/authorize?${query}`);
    await expect(page).toHaveURL(/(?:\/en)?\/sign-in/);
    await page.getByLabel('Email', { exact: true }).fill(TEST_USER_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(TEST_USER_PASSWORD);
    await page.getByTestId('sign-in-submit').click();
    await expect(page).toHaveURL(/(?:\/en)?\/connect\/workspace/);
    await expect(
      page.getByText('client.example', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Organization', exact: true })
      .selectOption(TEST_ORG_ID);
    await page
      .getByRole('combobox', { name: 'Assistant', exact: true })
      .selectOption(TEST_PROJECT_ID);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(/(?:\/en)?\/connect\/consent/);
    await expect(
      page.getByText('client.example', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Allow access', exact: true })
      .click();
    await expect(page).toHaveURL(/https:\/\/client.example\/callback/);
    const callback = new URL(page.url());
    expect(callback.searchParams.get('state')).toBe('consent-test-state');
    const tokenResponse = await request.post('/api/auth/oauth2/token', {
      form: {
        grant_type: 'authorization_code',
        code: callback.searchParams.get('code')!,
        redirect_uri: 'https://client.example/callback',
        client_id: client.client_id,
        code_verifier: verifier,
        resource,
      },
    });
    expect(tokenResponse.ok()).toBe(true);
    const token = await tokenResponse.json();
    const metadata = await (
      await request.get('/.well-known/oauth-authorization-server')
    ).json();
    const jwks = await (await request.get(metadata.jwks_uri)).json();
    const { payload } = await jwtVerify(
      token.access_token,
      createLocalJWKSet(jwks),
      { issuer: metadata.issuer, audience: resource },
    );
    expect(payload).toMatchObject({
      sub: TEST_USER_ID,
      org: TEST_ORG_ID,
      project: TEST_PROJECT_ID,
      client_id: client.client_id,
    });
    expect(String(payload.scope).split(' ')).toContain('mcp:read');
    expect(payload.exp! - payload.iat!).toBe(900);
    expect(token.refresh_token).toBeTruthy();
    await prisma.organizationSettings.update({
      where: { organizationId: TEST_ORG_ID },
      data: { featureOverrides: { ...features, mcpOAuth: false } },
    });
    const refresh = await request.post('/api/auth/oauth2/token', {
      form: {
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
        client_id: client.client_id,
        resource,
      },
    });
    expect(refresh.ok()).toBe(false);
  } finally {
    await prisma.organizationSettings.update({
      where: { organizationId: TEST_ORG_ID },
      data: { featureOverrides: original ?? {} },
    });
    await context.close();
    await request.dispose();
    await prisma.$disconnect();
  }
});
