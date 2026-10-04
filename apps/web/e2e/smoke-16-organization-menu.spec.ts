import { expect, test, type Page } from '@playwright/test';

import { TEST_THREAD_ID, TEST_THREAD_TITLE } from './constants';

/**
 * The page a section was entered from is remembered after hydration, in an
 * effect. A thread page is visible from the server's HTML before that runs, so
 * a test that navigates on as soon as it sees it can leave nothing remembered.
 */
async function rememberedReturnPath(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    window.sessionStorage.getItem('ragen:organization-return-path'),
  );
}

/**
 * Inside /organization the sidebar lists the section's pages in place of the
 * main menu and the thread history, with a way back (#1399). `smoke-` so it
 * gates the PR that breaks it.
 *
 * What it pins: one navigation column rather than two, the way back landing on
 * the page the section was entered from after the reader has moved between
 * several pages inside it (which `history.back()` would get wrong), and the
 * fallback to a new chat when the section is opened with nothing before it.
 */
test.describe('Organization menu in the sidebar (smoke)', () => {
  test('goes back to the thread it was entered from, after two organization pages', async ({
    page,
  }) => {
    // The page the reader is on is remembered as it is visited.
    await page.goto(`/pl/chats/${TEST_THREAD_ID}`);
    await expect(page).toHaveURL(new RegExp(`/chats/${TEST_THREAD_ID}`));
    await expect(
      page.getByRole('link', { name: TEST_THREAD_TITLE }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => rememberedReturnPath(page), { timeout: 15_000 })
      .toContain(TEST_THREAD_ID);

    await page.goto('/pl/organization/profile');

    // One column, and it is the sidebar: the organization's pages are listed
    // once, and the thread history that was there has stepped aside.
    const back = page.getByTestId('organization-back');
    await expect(back).toBeVisible({ timeout: 15_000 });
    await expect(back).toHaveText(/menu główne/i);
    await expect(page.getByRole('link', { name: 'Chatboty' })).toHaveCount(1);
    await expect(
      page.getByRole('link', { name: TEST_THREAD_TITLE }),
    ).toHaveCount(0);

    // Two more pages inside the section, through the menu itself.
    await page.getByRole('link', { name: 'Chatboty' }).click();
    await expect(page).toHaveURL(/\/organization\/chatbots/);
    await page.getByRole('link', { name: 'Klucze API' }).click();
    await expect(page).toHaveURL(/\/organization\/api-keys/);

    // Back is the page it was entered from, not the previous organization page.
    await expect(page.getByTestId('organization-back')).toHaveAttribute(
      'href',
      new RegExp(`/chats/${TEST_THREAD_ID}`),
      { timeout: 15_000 },
    );
    await page.getByTestId('organization-back').click();
    await expect(page).toHaveURL(new RegExp(`/chats/${TEST_THREAD_ID}`), {
      timeout: 15_000,
    });
  });

  test('goes to a new chat when the section is opened with nothing before it', async ({
    page,
  }) => {
    // A fresh browser context has seen no page, as for a bookmarked URL.
    await page.goto('/pl/organization/profile');

    const back = page.getByTestId('organization-back');
    await expect(back).toBeVisible({ timeout: 15_000 });
    await back.click();

    await expect(page).toHaveURL(/\/pl\/new/, { timeout: 15_000 });
  });
});

/**
 * The same mechanism for the user's own settings: inside /settings the sidebar
 * lists only the user's pages, and none of the organization's — Knowledge
 * analytics and PII policy used to sit in that menu under "Privacy".
 */
test.describe('Settings menu in the sidebar (smoke)', () => {
  test('lists only the user’s pages, and goes back to the thread it was entered from', async ({
    page,
  }) => {
    await page.goto(`/pl/chats/${TEST_THREAD_ID}`);
    await expect(
      page.getByRole('link', { name: TEST_THREAD_TITLE }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => rememberedReturnPath(page), { timeout: 15_000 })
      .toContain(TEST_THREAD_ID);

    await page.goto('/pl/settings/general');

    const back = page.getByTestId('settings-back');
    await expect(back).toBeVisible({ timeout: 15_000 });
    await expect(back).toHaveText(/menu główne/i);
    // Every entry the menu always lists, drawn once. Memory is left out: it is
    // listed only while the organization has personal memory on, or the user
    // still has memories, and the component tests cover that filtering.
    for (const name of [
      'Ogólne',
      'Konto',
      'Integracje',
      'Udostępnione wątki',
    ]) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveCount(
        1,
      );
    }
    await expect(
      page.getByRole('link', { name: TEST_THREAD_TITLE }),
    ).toHaveCount(0);

    // The organization's screens are not in this menu, even for an owner.
    for (const name of ['Analityka wiedzy', 'Polityka PII', 'Chatboty']) {
      await expect(page.getByRole('link', { name })).toHaveCount(0);
    }

    await page.getByRole('link', { name: 'Konto' }).click();
    await expect(page).toHaveURL(/\/settings\/account/);

    await expect(page.getByTestId('settings-back')).toHaveAttribute(
      'href',
      new RegExp(`/chats/${TEST_THREAD_ID}`),
      { timeout: 15_000 },
    );
    await page.getByTestId('settings-back').click();
    await expect(page).toHaveURL(new RegExp(`/chats/${TEST_THREAD_ID}`), {
      timeout: 15_000,
    });
  });
});
