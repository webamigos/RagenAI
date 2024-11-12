import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/en');
});

test('send button is disabled when input is empty', async ({ page }) => {
  await page.getByRole('button', { name: 'Start new thread' }).click();
  await page.waitForTimeout(2000);

  const sendButton = page.getByTestId('send-button');

  await expect(sendButton).toBeDisabled();
});

test('home screen validation', async ({ page }) => {
  await page.getByRole('button', { name: 'Start new thread' }).click();
  await page.waitForTimeout(2000);

  await page.getByPlaceholder('Enter your question').click();
  await page.getByPlaceholder('Enter your question').fill('something');
  await page.waitForTimeout(500);

  const sendButton = page.getByTestId('send-button');
  await expect(sendButton).toBeEnabled();
});
