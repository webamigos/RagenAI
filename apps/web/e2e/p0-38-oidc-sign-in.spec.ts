import { test, expect } from '@playwright/test';
import {
  REGISTRATION_ENABLED_KEY,
  registrationSettingValue,
} from '@ragenai/platform-contracts';

import pl from '../src/app/messages/pl.json';
import { TEST_ORG_ID } from './constants';
import { ROUTES } from './helpers';

/**
 * Company sign-in over OpenID Connect, end to end, against the mock issuer
 * `global.setup.ts` starts on 4300 and the `OIDC_*` settings in
 * `playwright.config.ts`.
 *
 * p0 because it is a way into the application: a regression that let an
 * address outside the allowed domains in, or put an SSO user anywhere but the
 * configured organization, must block the merge that causes it. Step B1 of
 * docs/specs/2026-10-17-ragen-as-an-on-premises-appliance.md.
 */

const ISSUER = 'http://localhost:4300';

async function nextIdentity(email: string, emailVerified = true) {
  const response = await fetch(`${ISSUER}/__identity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      email_verified: emailVerified,
      name: 'SSO Tester',
    }),
  });
  expect(response.ok).toBe(true);
}

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

test.describe('P0 — company sign-in (OIDC)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const created: string[] = [];

  test.afterAll(async () => {
    if (created.length === 0) {
      return;
    }
    await withPrisma(async (prisma) => {
      const users = await prisma.user.findMany({
        where: { email: { in: created } },
        select: { id: true },
      });
      const ids = users.map((user: { id: string }) => user.id);
      await prisma.member.deleteMany({ where: { userId: { in: ids } } });
      await prisma.session.deleteMany({ where: { userId: { in: ids } } });
      await prisma.account.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    });
  });

  test('an allowed address signs in and joins the configured organization', async ({
    page,
  }) => {
    const email = `sso-${Date.now()}@oidc-e2e.test`;
    created.push(email);
    await nextIdentity(email);

    await page.goto(ROUTES.signIn);
    await page.getByTestId('sign-in-sso').click();

    await expect(page).toHaveURL(/\/pl\/new/, { timeout: 30_000 });
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15_000 });

    const memberships = await withPrisma((prisma) =>
      prisma.member.findMany({
        where: { user: { email } },
        select: { organizationId: true, role: true },
      }),
    );
    // A member of the seeded organization, and of nothing else: no personal
    // organization was provisioned alongside it.
    expect(memberships).toEqual([
      { organizationId: TEST_ORG_ID, role: 'member' },
    ]);
  });

  test('an address outside the allowed domains is refused and no account is created', async ({
    page,
  }) => {
    const email = `eve-${Date.now()}@not-allowed.test`;
    await nextIdentity(email);

    await page.goto(ROUTES.signIn);
    await page.getByTestId('sign-in-sso').click();

    // Back on the sign-in page — not on the callback URL showing JSON — with
    // the sentence for this refusal rather than a generic one.
    await expect(page).toHaveURL(
      /\/pl\/sign-in\?.*error=oidc_domain_not_allowed/,
      {
        timeout: 30_000,
      },
    );
    const alert = page.getByTestId('sign-in-sso-error');
    await expect(alert).toHaveAttribute(
      'data-error',
      'oidc_domain_not_allowed',
    );
    await expect(alert).toHaveText(pl['sign-in']['sso-error-domain']);

    const user = await withPrisma((prisma) =>
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
    );
    expect(user).toBeNull();
  });

  test('with registration closed, an address the issuer did not verify is refused on the sign-in page and no account is created', async ({
    page,
  }) => {
    // The path found against a real Entra tenant on 2026-10-19: the refusal
    // comes from the user-create hook, which Better Auth used to answer with
    // a JSON body on /api/auth/callback/oidc. Closed registration is what puts
    // the hook in the way; the suite seeds it open, so this test closes it and
    // puts it back. Workers are 1 and the suite is not parallel, so no other
    // spec sees it closed.
    const email = `unverified-${Date.now()}@oidc-e2e.test`;
    await nextIdentity(email, false);

    const setRegistration = (enabled: boolean) =>
      withPrisma((prisma) =>
        prisma.settings.upsert({
          where: { key: REGISTRATION_ENABLED_KEY },
          create: {
            key: REGISTRATION_ENABLED_KEY,
            value: registrationSettingValue(enabled),
          },
          update: { value: registrationSettingValue(enabled) },
        }),
      );

    await setRegistration(false);
    try {
      await page.goto(ROUTES.signIn);
      await page.getByTestId('sign-in-sso').click();

      await expect(page).toHaveURL(
        /\/pl\/sign-in\?.*error=oidc_email_not_verified/,
        { timeout: 30_000 },
      );
      const alert = page.getByTestId('sign-in-sso-error');
      await expect(alert).toHaveAttribute(
        'data-error',
        'oidc_email_not_verified',
      );
      await expect(alert).toHaveText(
        pl['sign-in']['sso-error-email-not-verified'],
      );
    } finally {
      await setRegistration(true);
    }

    const user = await withPrisma((prisma) =>
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
    );
    expect(user).toBeNull();
  });
});
