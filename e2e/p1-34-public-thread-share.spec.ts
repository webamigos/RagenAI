import { test, expect } from '@playwright/test';
import { AUTH_FILE, TEST_THREAD_ID } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

async function openShareDialog(page: import('@playwright/test').Page) {
  // Navigate directly to the seeded thread so the sidebar shows it as active
  await page.goto(`${ROUTES.chats}/${TEST_THREAD_ID}`);
  await page.waitForURL(`**/${TEST_THREAD_ID}`, { timeout: 15_000 });

  // The seeded thread appears in the sidebar; hover to reveal its context menu
  const threadItem = page
    .locator('[data-testid="thread-item"]')
    .filter({ hasText: /E2E Seeded Thread/i })
    .first();
  await expect(threadItem).toBeVisible({ timeout: 15_000 });
  await threadItem.hover();
  await threadItem.locator('[data-testid="thread-menu-trigger"]').click();
  await page.getByRole('menuitem', { name: /udostępnij publicznie/i }).click();

  // If a link already exists from a previous failed test run, revoke it first
  const revokeBtn = page.getByRole('button', { name: /unieważnij link/i });
  if (await revokeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await revokeBtn.click();
    await page
      .getByRole('button', { name: /unieważnij/i })
      .last()
      .click();
  }

  const generateBtn = page.getByRole('button', { name: /generuj link/i });
  await expect(generateBtn).toBeEnabled({ timeout: 5_000 });
  return generateBtn;
}

test.describe('Public thread share', () => {
  test('creates public link without password and views it anonymously', async ({
    page,
    browser,
  }) => {
    const generateBtn = await openShareDialog(page);
    await generateBtn.click();

    const linkInput = page.locator('input[readonly]');
    await expect(linkInput).toBeVisible();
    const publicUrl = await linkInput.inputValue();
    expect(publicUrl).toContain('/public/thread/');

    const anonContext = await browser.newContext({ storageState: undefined });
    const anonPage = await anonContext.newPage();
    await anonPage.goto(publicUrl);

    await expect(
      anonPage.locator('p:text("Ty"), p:text("Asystent")').first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      anonPage.locator('[data-testid="prompt-form"]'),
    ).not.toBeVisible();

    await anonContext.close();

    await page.getByRole('button', { name: /unieważnij link/i }).click();
    await page
      .getByRole('button', { name: /unieważnij/i })
      .last()
      .click();
  });

  test('revoked link returns 404', async ({ page, browser }) => {
    const generateBtn = await openShareDialog(page);
    await generateBtn.click();

    const linkInput = page.locator('input[readonly]');
    await expect(linkInput).toBeVisible();
    const publicUrl = await linkInput.inputValue();

    await page.getByRole('button', { name: /unieważnij link/i }).click();
    await page
      .getByRole('button', { name: /unieważnij/i })
      .last()
      .click();

    // Wait for revoke to complete (dialog returns to generate state), then close
    await expect(
      page.getByRole('button', { name: /generuj link/i }),
    ).toBeVisible();
    await page.getByRole('button', { name: /anuluj/i }).click();

    await page.goto('/pl/settings/shared-threads');
    await expect(page.getByText(/brak udostępnionych wątków/i)).toBeVisible();

    const anonContext = await browser.newContext({ storageState: undefined });
    const anonPage = await anonContext.newPage();
    const response = await anonPage.goto(publicUrl);
    expect(response?.status()).toBe(404);
    await anonContext.close();
  });

  test('password protected link requires password', async ({
    page,
    browser,
  }) => {
    const generateBtn = await openShareDialog(page);

    await page.getByPlaceholder(/zostaw puste/i).fill('secret123');
    await generateBtn.click();

    const linkInput = page.locator('input[readonly]');
    await expect(linkInput).toBeVisible();
    const publicUrl = await linkInput.inputValue();

    const anonContext = await browser.newContext({ storageState: undefined });
    const anonPage = await anonContext.newPage();
    await anonPage.goto(publicUrl);
    await expect(anonPage.getByText(/chroniony hasłem/i)).toBeVisible();

    await anonPage.getByPlaceholder(/hasło/i).fill('wrongpass');
    await anonPage.getByRole('button', { name: /wyświetl wątek/i }).click();
    await expect(anonPage.getByText(/nieprawidłowe hasło/i)).toBeVisible();

    await anonPage.getByPlaceholder(/hasło/i).fill('secret123');
    await anonPage.getByRole('button', { name: /wyświetl wątek/i }).click();
    await expect(
      anonPage.locator('p:text("Ty"), p:text("Asystent")').first(),
    ).toBeVisible({ timeout: 10000 });

    await anonContext.close();

    await page.getByRole('button', { name: /unieważnij link/i }).click();
    await page
      .getByRole('button', { name: /unieważnij/i })
      .last()
      .click();
  });
});
