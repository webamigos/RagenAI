import { test, expect } from '@playwright/test';
import { login, ROUTES } from './helpers';

test.describe('Support Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('strona /support renderuje CategoryStep', async ({ page }) => {
    await page.goto(ROUTES.support);
    await expect(
      page.getByText(/Jak możemy pomóc|How can we help/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Bug')).toBeVisible();
    await expect(page.getByText(/Pytanie|Question/)).toBeVisible();
    await expect(page.getByText(/Sugestia|Suggestion/)).toBeVisible();
  });

  test('przejście przez flow Bug → formularz → back → kategorie', async ({
    page,
  }) => {
    await page.goto(ROUTES.support);
    await expect(
      page.getByText(/Jak możemy pomóc|How can we help/i),
    ).toBeVisible({ timeout: 10000 });
    await page.getByText('Bug').click();
    await expect(page.getByText(/Tytuł|Title/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Kroki do reprodukcji|Steps/)).toBeVisible();
    await page.getByText(/Wstecz|Back/).click();
    await expect(
      page.getByText(/Jak możemy pomóc|How can we help/i),
    ).toBeVisible();
  });

  test('floating button otwiera modal support', async ({ page }) => {
    await page.goto(ROUTES.chats);
    await page.getByTestId('support-floating-button').click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Bug')).toBeVisible();
  });
});
