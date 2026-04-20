import { test, expect } from '@playwright/test';
import { login, ROUTES } from './helpers';

test.describe('Public thread share', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('creates public link without password and views it anonymously', async ({
    page,
    browser,
  }) => {
    await page.goto(ROUTES.chats);
    await page.waitForLoadState('networkidle');

    const firstThread = page.locator('[data-testid="thread-item"]').first();
    await firstThread.hover();
    await firstThread.locator('[data-testid="thread-menu-trigger"]').click();

    await page
      .getByRole('menuitem', { name: /udostępnij publicznie/i })
      .click();

    await page.getByRole('button', { name: /generuj link/i }).click();

    const linkInput = page.locator('input[readonly]');
    await expect(linkInput).toBeVisible({ timeout: 5000 });
    const publicUrl = await linkInput.inputValue();
    expect(publicUrl).toContain('/public/thread/');

    const anonContext = await browser.newContext({ storageState: undefined });
    const anonPage = await anonContext.newPage();
    await anonPage.goto(publicUrl);

    await expect(
      anonPage.locator('text=Ty').or(anonPage.locator('text=Asystent')),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      anonPage.locator('[data-testid="prompt-form"]'),
    ).not.toBeVisible();

    await anonContext.close();

    // Cleanup — revoke the created link
    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /unieważnij link/i }).click();
  });

  test('revoked link returns 404', async ({ page, browser }) => {
    await page.goto(ROUTES.chats);
    await page.waitForLoadState('networkidle');

    const firstThread = page.locator('[data-testid="thread-item"]').first();
    await firstThread.hover();
    await firstThread.locator('[data-testid="thread-menu-trigger"]').click();
    await page
      .getByRole('menuitem', { name: /udostępnij publicznie/i })
      .click();
    await page.getByRole('button', { name: /generuj link/i }).click();

    const linkInput = page.locator('input[readonly]');
    await expect(linkInput).toBeVisible({ timeout: 5000 });
    const publicUrl = await linkInput.inputValue();

    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /unieważnij link/i }).click();

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
    await page.goto(ROUTES.chats);
    await page.waitForLoadState('networkidle');

    const firstThread = page.locator('[data-testid="thread-item"]').first();
    await firstThread.hover();
    await firstThread.locator('[data-testid="thread-menu-trigger"]').click();
    await page
      .getByRole('menuitem', { name: /udostępnij publicznie/i })
      .click();

    await page.getByPlaceholder(/zostaw puste/i).fill('secret123');
    await page.getByRole('button', { name: /generuj link/i }).click();

    const linkInput = page.locator('input[readonly]');
    await expect(linkInput).toBeVisible({ timeout: 5000 });
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
      anonPage.locator('text=Ty').or(anonPage.locator('text=Asystent')),
    ).toBeVisible({ timeout: 10000 });

    await anonContext.close();

    // Cleanup — revoke created link
    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /unieważnij link/i }).click();
  });
});
