import { expect, test } from '@playwright/test';

import {
  TEST_BRAIN_PAGE_TITLE,
  TEST_BRAIN_SOURCE_QUOTE,
  TEST_FILE_NAME,
} from './constants';

/**
 * Ragen Brain's read-only panel (spec D1), as the seeded owner with the
 * `brain` flag on for the test org. `smoke-` so it gates the PR that breaks
 * it. What it pins: the sidebar link, the three pages rendering real rows,
 * a citation showing that its document moved on since it was read, and the
 * graph drawing (D4).
 */
test.describe('Ragen Brain panel (smoke)', () => {
  test('the sidebar links to Brain', async ({ page }) => {
    await page.goto('/pl/chats');
    await expect(
      page.getByRole('link', { name: 'Brain', exact: true }),
    ).toBeVisible({
      timeout: 15000,
    });
  });

  test('lists the seeded page and opens it with its source', async ({
    page,
  }) => {
    await page.goto('/pl/brain');
    await expect(
      page.getByRole('heading', { name: 'Ragen Brain' }),
    ).toBeVisible({
      timeout: 15000,
    });
    const row = page.getByRole('link', { name: TEST_BRAIN_PAGE_TITLE });
    await expect(row).toBeVisible();

    await row.click();
    await expect(
      page.getByRole('heading', { name: TEST_BRAIN_PAGE_TITLE, level: 2 }),
    ).toBeVisible({ timeout: 15000 });
    const source = page.getByTestId('brain-source').first();
    await expect(source).toContainText(TEST_BRAIN_SOURCE_QUOTE);
    await expect(source).toContainText(TEST_FILE_NAME);
    // Pinned to version 1; the document's active version is 2.
    await expect(source).toContainText('Dokument ma nowszą wersję');
    await expect(page.getByText('Cała organizacja')).toBeVisible();
    await expect(
      page.getByText('Strona nie jest powiązana z żadną inną'),
    ).toBeVisible();
  });

  test('draws the graph with an honest count', async ({ page }) => {
    await page.goto('/pl/brain/graph');
    await expect(page.getByTestId('brain-graph-count')).toContainText(
      /Wyświetlono \d+ z \d+ stron/,
      { timeout: 15000 },
    );
    await expect(page.getByTestId('brain-graph')).toBeVisible();
    // Sigma mounts its canvases into the container once WebGL is up.
    await expect(
      page.getByTestId('brain-graph').locator('canvas').first(),
    ).toBeAttached({
      timeout: 15000,
    });
  });

  test('lists open findings, including a failed extraction', async ({
    page,
  }) => {
    await page.goto('/pl/brain/findings');
    await expect(page.getByTestId('brain-finding-row').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText('Nie udało się przetworzyć dokumentu'),
    ).toBeVisible();
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });
});
