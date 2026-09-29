import { test, expect } from '@playwright/test';

import {
  AUTH_FILE,
  TEST_DIAGNOSED_DOCUMENT_ID,
  TEST_DIAGNOSED_FILE_ID,
  TEST_FILE_ID,
} from './constants';
import { ROUTES } from './helpers';

/**
 * Document diagnostics in the panel (spec 2026-09-26-rag-readiness-score-review,
 * C3). `p1`, so it does not gate a merge. The `documentDiagnostics` key is on
 * by default since D4; the seed also sets it for the test organization, so the
 * test does not depend on the default.
 *
 * The findings are seeded on the file's metadata. What this proves is that the
 * list and the document view read what the worker writes; the checks that
 * write it are tested in apps/worker.
 */

test.use({ storageState: AUTH_FILE });

test.describe('Document diagnostics', () => {
  test('the list names a warning on the diagnosed file and marks no other', async ({
    page,
  }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    const diagnosed = page.getByTestId(`file-row-${TEST_DIAGNOSED_FILE_ID}`);
    await expect(diagnosed.getByTestId('diagnostics-badge')).toHaveText(
      'Tabela bez nagłówków',
    );

    // A file with no stored diagnostics was not checked; it gets no badge,
    // and in particular no "all clear".
    const unchecked = page.getByTestId(`file-row-${TEST_FILE_ID}`);
    await expect(unchecked).toBeVisible();
    await expect(unchecked.getByTestId('diagnostics-badge')).toHaveCount(0);
  });

  test('the document view lists each finding with what to do', async ({
    page,
  }) => {
    await page.goto(`/pl/knowledge/documents/${TEST_DIAGNOSED_DOCUMENT_ID}`);

    const panel = page.getByTestId('diagnostics-panel');
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel).toContainText('Diagnostyka indeksowania');

    const headerless = panel.getByTestId('diagnostic-table-without-header');
    await expect(headerless).toContainText('Wymaga uwagi');
    await expect(headerless).toContainText(
      'Fragmenty, których dotyczy: 4 z 12',
    );

    // Information-only findings appear here, never on the list's badge.
    await expect(
      panel.getByTestId('diagnostic-overlap-duplication'),
    ).toContainText('Informacyjnie');
  });
});
