import { expect, test, type APIRequestContext } from '@playwright/test';

import { INSTANCE_PALETTE_OPTIONS } from '@ragenai/platform-contracts';

/**
 * Instance branding (spec 2026-10-17-ragen-as-an-on-premises-appliance, B2):
 * the panel draws the install's logo, name and palette once the
 * `instanceBranding` key is on.
 *
 * `smoke-` because the spec's Testing section asks for it to gate the merge:
 * the failure mode is quiet — a provider not mounted, a cache never cleared,
 * a CSS block that matches nothing — and every unit test would stay green
 * through all three. See
 * `docs/lessons/a-feature-merged-into-a-component-nothing-renders.md`.
 *
 * **Saved through the internal endpoint, not written with Prisma.** That is
 * the path `apps/admin` uses and the only one that clears apps/web's branding
 * cache; a row written directly would sit behind a 60-second cache this
 * server filled while serving the specs before this one (`p0-29` learned that
 * the hard way). `playwright.config.ts` gives the run its secret. The feature
 * key is a platform default, which the save's cache clear also picks up.
 *
 * Everything is put back in `afterAll`, so the `p*` specs that run after the
 * smoke tier see Ragen's branding.
 */

const PRODUCT_NAME = 'Acme Knowledge';
const PALETTE = 'violet';
const SECRET = process.env.INTERNAL_API_SECRET ?? '';
const ADMIN_USER_ID = 'e2e-test-user-0000-0000-0001';
const DEFAULTS_KEY = 'default_features';

/** A 1×1 PNG. Real bytes, because the server checks content, not names. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function withPrisma<T>(fn: (prisma: any) => Promise<T>): Promise<T> {
  const { PrismaClient } = await import('../src/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** Sets the key in the platform defaults, returning the row as it was. */
async function switchFeatureOn(): Promise<string | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.settings.findUnique({
      where: { key: DEFAULTS_KEY },
    });
    let stored: Record<string, boolean> = {};
    try {
      stored = row ? JSON.parse(row.value) : {};
    } catch {
      stored = {};
    }
    const value = JSON.stringify({ ...stored, instanceBranding: true });
    await prisma.settings.upsert({
      where: { key: DEFAULTS_KEY },
      update: { value },
      create: { key: DEFAULTS_KEY, value },
    });
    return row ? row.value : null;
  });
}

async function restoreDefaults(previous: string | null): Promise<void> {
  await withPrisma(async (prisma) => {
    if (previous === null) {
      await prisma.settings.deleteMany({ where: { key: DEFAULTS_KEY } });
    } else {
      await prisma.settings.update({
        where: { key: DEFAULTS_KEY },
        data: { value: previous },
      });
    }
  });
}

function saveBranding(
  request: APIRequestContext,
  fields: Record<
    string,
    string | { name: string; mimeType: string; buffer: Buffer }
  >,
) {
  return request.post('/api/internal/instance-branding', {
    headers: { 'x-internal-secret': SECRET },
    multipart: { adminUserId: ADMIN_USER_ID, ...fields },
  });
}

test.describe.serial('Instance branding (smoke)', () => {
  let previousDefaults: string | null = null;

  test.beforeAll(async ({ request }) => {
    previousDefaults = await switchFeatureOn();

    const response = await saveBranding(request, {
      productName: PRODUCT_NAME,
      palette: PALETTE,
      removeLogo: 'false',
      logo: { name: 'logo.png', mimeType: 'image/png', buffer: PNG },
    });
    expect(
      response.status(),
      `the save was refused: ${await response.text()}`,
    ).toBe(200);
  });

  test.afterAll(async ({ request }) => {
    // The row first: its save clears the cache, so nothing renders the
    // custom branding after this, whatever the key is.
    await saveBranding(request, {
      productName: '',
      palette: 'ragen',
      removeLogo: 'true',
    });
    await restoreDefaults(previousDefaults);
  });

  test('the sidebar draws the uploaded logo and names the product', async ({
    page,
  }) => {
    await page.goto('/pl/chats');

    const logo = page.getByTestId('instance-logo').first();
    await expect(logo).toBeVisible({ timeout: 15_000 });
    await expect(logo).toHaveAttribute('src', /\/api\/branding\/logo\?v=\d+/);
    // The screen-reader name beside the mark.
    await expect(
      page.getByText(PRODUCT_NAME, { exact: true }).first(),
    ).toBeAttached();
  });

  test('the page title carries the product name, not Ragen’s', async ({
    page,
  }) => {
    await page.goto('/pl/chats');

    await expect(page).toHaveTitle(new RegExp(PRODUCT_NAME));
    await expect(page).not.toHaveTitle(/Ragen AI/);
  });

  test('the palette reaches the document root, so dialogs pick it up too', async ({
    page,
  }) => {
    await page.goto('/pl/chats');
    await expect(page.getByTestId('instance-logo').first()).toBeVisible({
      timeout: 15_000,
    });

    const brand = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-brand-600')
        .trim()
        .toLowerCase(),
    );
    expect(brand).toBe(INSTANCE_PALETTE_OPTIONS[PALETTE].swatch);
  });

  test('the logo is served to anyone, as an image, in a sandbox', async ({
    request,
  }) => {
    const response = await request.get('/api/branding/logo');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
    expect(response.headers()['content-security-policy']).toContain('sandbox');
  });
});
