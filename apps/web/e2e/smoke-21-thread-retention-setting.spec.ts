import { expect, test } from '@playwright/test';

/**
 * Per-organization thread retention (spec 2026-10-17, B4) on the
 * organization's settings page. `smoke-` so it gates the PR that breaks it.
 *
 * What it pins: the section renders for an owner, says it is off, and turning
 * it on asks for confirmation before anything is saved. It cancels rather
 * than confirms, so the seeded organization never gets a period and no other
 * spec's threads are put at risk by a run of this one.
 */
test.describe('Thread retention setting (smoke)', () => {
  test('is off by default and asks before turning it on', async ({ page }) => {
    await page.goto('/pl/organization/assistant-settings');

    const section = page.getByTestId('data-retention-section');
    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(
      section.getByRole('heading', { name: 'Przechowywanie danych' }),
    ).toBeVisible();
    await expect(page.getByTestId('thread-retention-current')).toHaveText(
      /Obecnie wyłączone/,
    );

    const save = section.getByRole('button', {
      name: 'Zapisz okres przechowywania',
    });
    await expect(save).toBeDisabled();

    await section.getByRole('radio', { name: /^30 dni/ }).check();
    await save.click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Usuwać wątki po 30 dniach?');
    await expect(dialog).toContainText('trwale usunięty');

    await dialog.getByRole('button', { name: /anuluj/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('thread-retention-current')).toHaveText(
      /Obecnie wyłączone/,
    );
  });
});
