import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

/**
 * An API key's scope is a permission boundary the API enforces on every
 * request, and this dialog is the only place it is ever chosen. p0 rather
 * than p2 for that reason: only `smoke-*` and `p0-*` gate a pull request, so
 * a break here has to fail the PR that causes it.
 *
 * Creating a key is deliberately not exercised. `createApiKeyCommand` writes
 * the secret to ragen-token-vault on :3100, which this suite does not run, so
 * a creation test would fail for a setup reason rather than a code one — the
 * failure mode the `ragen-e2e-triage` skill exists to untangle. The write path
 * is covered by the command's and the form's unit tests; what only a real
 * request can prove is that the page, the server action and the assistant
 * query agree against a real database, which is what this asserts.
 */
test.describe('API key scope P0', () => {
  test('the create dialog offers a scope, defaulting to the knowledge base', async ({
    page,
  }) => {
    await page.goto(ROUTES.organizationApiKeys);
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: /nowy klucz/i }).click();

    const knowledgeBase = page.getByRole('radio').first();
    await expect(knowledgeBase).toBeChecked();

    // The picker belongs to the other option, so it must not be here yet —
    // an always-visible one would read as "pick an assistant or else".
    await expect(page.locator('#api-key-assistant')).toBeHidden();
  });

  test('choosing one assistant reveals a picker filled from this organization', async ({
    page,
  }) => {
    await page.goto(ROUTES.organizationApiKeys);
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: /nowy klucz/i }).click();
    await page.getByRole('radio').nth(1).check();

    const picker = page.locator('#api-key-assistant');
    await expect(picker).toBeVisible();

    // Options come from `getOrgAssistantsQuery` through the server action, so
    // more than the placeholder means the whole path resolved against the
    // seeded org — the part no unit test can stand in for.
    await expect(picker.locator('option')).not.toHaveCount(1);
  });

  test('an assistant scope cannot be submitted without an assistant', async ({
    page,
  }) => {
    await page.goto(ROUTES.organizationApiKeys);
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: /nowy klucz/i }).click();
    await page.getByRole('textbox').first().fill('n8n');
    await page.getByRole('radio').nth(1).check();
    await page.getByRole('button', { name: /^stwórz$/i }).click();

    await expect(page.getByText(/źródło wiedzy jest wymagane/i)).toBeVisible();
  });
});
