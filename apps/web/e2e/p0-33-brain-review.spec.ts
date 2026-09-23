import { expect, test } from '@playwright/test';

import {
  TEST_BRAIN_REVIEW_PAGE_PUBLIC_ID,
  TEST_BRAIN_REVIEW_PAGE_TITLE,
  TEST_USER_NAME,
} from './constants';

/**
 * Ragen Brain's review flow (spec D2), end to end, as the seeded owner: name
 * an owner, widen access through its confirmation, approve — and find each
 * decision in the page's history. `p0-` because approval is what every later
 * phase (export, publication) starts from, and a break here must block the
 * merge that caused it.
 *
 * It changes its own seeded page, which the seed recreates on every run; a
 * retry within one run therefore meets an approved page and fails, which is
 * the honest answer to "did the first attempt work".
 */
test.describe('Ragen Brain review (p0)', () => {
  test('owner, widened access and approval land in the ledger', async ({
    page,
  }) => {
    await page.goto(`/pl/brain/pages/${TEST_BRAIN_REVIEW_PAGE_PUBLIC_ID}`);
    await expect(
      page.getByRole('heading', {
        name: TEST_BRAIN_REVIEW_PAGE_TITLE,
        level: 2,
      }),
    ).toBeVisible({ timeout: 15000 });

    // No owner yet: approval is offered, and refused until there is one.
    const approve = page.getByRole('button', { name: 'Zatwierdź stronę' });
    await expect(approve).toBeDisabled();

    await page.getByRole('combobox', { name: 'Właściciel' }).click();
    await page.getByRole('option', { name: TEST_USER_NAME }).click();
    await page.getByRole('button', { name: 'Zapisz właściciela' }).click();
    await expect(page.getByText('Właściciel zapisany')).toBeVisible();
    await expect(approve).toBeEnabled({ timeout: 15000 });

    // Widening to the whole organization asks first.
    await page.getByRole('button', { name: 'Zmień dostęp' }).click();
    await page.getByLabel('Cała organizacja').check();
    await page.getByRole('button', { name: 'Zapisz dostęp' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Poszerzyć dostęp do tej strony?');
    await dialog.getByRole('button', { name: 'Poszerz dostęp' }).click();
    await expect(page.getByText('Dostęp zapisany')).toBeVisible();
    await expect(page.getByText('Cała organizacja')).toBeVisible();

    await approve.click();
    await expect(page.getByText('Strona zatwierdzona')).toBeVisible();
    await expect(page.getByText('Zatwierdzona', { exact: true })).toBeVisible({
      timeout: 15000,
    });

    const history = page.getByTestId('brain-decisions');
    await expect(history).toContainText('Zatwierdzono');
    await expect(history).toContainText('Poszerzono dostęp');
    await expect(history).toContainText('Wskazano właściciela');
  });
});
