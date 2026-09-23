import { expect, test } from '@playwright/test';

import {
  TEST_BRAIN_MERGE_SOURCE_CLAIM,
  TEST_BRAIN_MERGE_SOURCE_PUBLIC_ID,
  TEST_BRAIN_MERGE_TARGET_CLAIM,
  TEST_BRAIN_MERGE_TARGET_PUBLIC_ID,
  TEST_BRAIN_MERGE_TITLE,
} from './constants';

/**
 * Merging a fresh candidate into the approved page on the same subject (spec
 * D2b) — the case the review queue exists for: a later extraction wrote a
 * candidate beside curated work rather than over it. `p0-` for the reason
 * p0-33 gives. Owns its two seeded pages.
 */
test.describe('Ragen Brain merge (p0)', () => {
  test('a candidate folds into the page on the same subject', async ({
    page,
  }) => {
    await page.goto(`/pl/brain/pages/${TEST_BRAIN_MERGE_SOURCE_PUBLIC_ID}`);
    await expect(
      page.getByRole('heading', { name: TEST_BRAIN_MERGE_TITLE, level: 2 }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole('combobox', { name: 'Scal ze stroną' }).click();
    // Same title, suffixed slug: offered first, as the same subject.
    await expect(page.getByText('Wygląda na ten sam temat')).toBeVisible();
    await page
      .getByRole('option', { name: TEST_BRAIN_MERGE_TITLE })
      .first()
      .click();
    await page.getByRole('button', { name: 'Scal z tą stroną' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Scalić tę stronę?');
    await dialog.getByRole('button', { name: 'Scal z tą stroną' }).click();

    await page.waitForURL(
      `**/brain/pages/${TEST_BRAIN_MERGE_TARGET_PUBLIC_ID}`,
    );
    await expect(
      page.getByText(TEST_BRAIN_MERGE_TARGET_CLAIM).first(),
    ).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText(TEST_BRAIN_MERGE_SOURCE_CLAIM).first(),
    ).toBeVisible();
    // It says new things now, so it is back in review.
    await expect(page.getByText('Kandydat', { exact: true })).toBeVisible();
    await expect(page.getByTestId('brain-source')).toHaveCount(2);
    await expect(page.getByTestId('brain-decisions')).toContainText('Scalono');

    await page.goto(`/pl/brain/pages/${TEST_BRAIN_MERGE_SOURCE_PUBLIC_ID}`);
    await expect(page.getByText('Odrzucona', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Scalona ze stroną')).toBeVisible();
  });
});
