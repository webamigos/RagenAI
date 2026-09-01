import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Document Preview Slideover', () => {
  test('otwiera slideover po kliknięciu w wiersz dokumentu', async ({
    page,
  }) => {
    await page.goto(ROUTES.knowledgeDocuments);

    // Poczekaj aż tabela się załaduje
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    // Kliknij w pierwszy wiersz pliku (używaj locatora który pasuje do wzorca file-row-*)
    const firstFileRow = page.locator('[data-testid^="file-row-"]').first();
    await firstFileRow.waitFor({ state: 'visible', timeout: 10_000 });
    await firstFileRow.click();

    // Assert: slideover jest widoczny — szukamy overlay
    await expect(page.getByTestId('preview-overlay')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('zamyka slideover klawiszem Esc', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);

    // Poczekaj aż tabela się załaduje
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    // Kliknij w pierwszy wiersz pliku
    const firstFileRow = page.locator('[data-testid^="file-row-"]').first();
    await firstFileRow.waitFor({ state: 'visible', timeout: 10_000 });
    await firstFileRow.click();

    // Assert: slideover jest widoczny
    await expect(page.getByTestId('preview-overlay')).toBeVisible({
      timeout: 5_000,
    });

    // Naciśnij Escape
    await page.keyboard.press('Escape');

    // Assert: slideover nie jest widoczny
    await expect(page.getByTestId('preview-overlay')).not.toBeVisible({
      timeout: 3_000,
    });
  });

  test('zamyka slideover po kliknięciu na overlay', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);

    // Poczekaj aż tabela się załaduje
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    // Kliknij w pierwszy wiersz pliku
    const firstFileRow = page.locator('[data-testid^="file-row-"]').first();
    await firstFileRow.waitFor({ state: 'visible', timeout: 10_000 });
    await firstFileRow.click();

    // Assert: slideover jest widoczny
    const overlay = page.getByTestId('preview-overlay');
    await expect(overlay).toBeVisible({ timeout: 5_000 });

    // Kliknij na lewą krawędź overlay (poza panelem slideover który jest po prawej)
    await overlay.click({ position: { x: 10, y: 10 } });

    // Assert: slideover nie jest widoczny
    await expect(overlay).not.toBeVisible({ timeout: 3_000 });
  });
});
