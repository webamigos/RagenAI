import { test, expect } from '@playwright/test';

test.describe('404 page', () => {
  test('localized /pl 404 shows branded layout', async ({ page }) => {
    await page.goto('/pl/non-existent-route-xyzabc');

    await expect(
      page.getByRole('heading', { name: /nie znaleziono strony/i }),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(/nie udało nam się znaleźć strony/i),
    ).toBeVisible({
      timeout: 10_000,
    });
    const backLink = page.getByRole('link', {
      name: /powrót do strony głównej/i,
    });
    await expect(backLink).toBeVisible({ timeout: 10_000 });
    await expect(backLink).toHaveAttribute('href', '/');
  });

  test('localized /en 404 shows branded layout', async ({ page }) => {
    await page.goto('/en/non-existent-route-xyzabc');

    await expect(
      page.getByRole('heading', { name: /page not found/i }),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/couldn't find the page/i)).toBeVisible({
      timeout: 10_000,
    });
    const backLink = page.getByRole('link', { name: /go back to home/i });
    await expect(backLink).toBeVisible({ timeout: 10_000 });
    await expect(backLink).toHaveAttribute('href', '/');
  });

  test('404 page displays the 404 number', async ({ page }) => {
    await page.goto('/pl/non-existent-route-xyzabc');

    const occurrences = page.getByText('404');
    await expect(occurrences.first()).toBeVisible({ timeout: 10_000 });
  });
});
