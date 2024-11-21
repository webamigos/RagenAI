import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/en');
});

// Currently users should log in to create a thread so this tests is scenario is no longer used
test.skip('send button is disabled when input is empty', async ({ page }) => {
  await page.getByRole('button', { name: 'Start new thread' }).click();
  await page.waitForTimeout(2000);

  const sendButton = page.getByTestId('send-button');

  await expect(sendButton).toBeDisabled();
});

test.skip('home screen validation', async ({ page }) => {
  await page.getByRole('button', { name: 'Start new thread' }).click();
  await page.waitForTimeout(2000);

  await page.getByPlaceholder('Enter your question').click();
  await page.getByPlaceholder('Enter your question').fill('something');
  await page.waitForTimeout(500);

  const sendButton = page.getByTestId('send-button');
  await expect(sendButton).toBeEnabled();
});
