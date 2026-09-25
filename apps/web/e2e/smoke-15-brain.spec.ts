import { expect, test } from '@playwright/test';

import {
  TEST_BRAIN_ASSISTANT_PAGE_PUBLIC_ID,
  TEST_BRAIN_ASSISTANT_PAGE_TITLE,
  TEST_BRAIN_PAGE_PUBLIC_ID,
  TEST_BRAIN_PAGE_TITLE,
  TEST_BRAIN_SOURCE_QUOTE,
  TEST_FILE_NAME,
  TEST_USER_NAME,
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

  test('offers the bundle and serves it as a zip', async ({ page }) => {
    await page.goto('/pl/brain');
    const bar = page.getByTestId('brain-export');
    await expect(bar).toContainText(/Gotowe do eksportu: \d+/, {
      timeout: 15000,
    });
    const res = await page.request.get('/api/brain/export');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/zip');
    // A zip starts with the local-file-header signature "PK\x03\x04".
    expect((await res.body()).subarray(0, 2).toString()).toBe('PK');
  });

  test('draws the graph with an honest count', async ({ page }) => {
    await page.goto('/pl/brain/graph');
    await expect(page.getByTestId('brain-graph-count')).toContainText(
      /Strony: \d+ z \d+/,
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

  /**
   * "Open page" from the graph opens the page in a drawer over it, so the
   * graph and what was picked there survive; a reload of the same URL opens
   * the full page. `?focus=` picks the page without clicking the canvas,
   * which WebGL makes a guess.
   */
  test('opens a page from the graph in a drawer, and closes back to the graph', async ({
    page,
  }) => {
    await page.goto(`/pl/brain/graph?focus=${TEST_BRAIN_PAGE_PUBLIC_ID}`);
    const card = page.getByTestId('brain-graph-card');
    await expect(card).toContainText(TEST_BRAIN_PAGE_TITLE, { timeout: 15000 });

    await card.getByRole('link', { name: 'Otwórz stronę' }).click();
    const drawer = page.getByTestId('brain-page-drawer');
    await expect(
      drawer.getByRole('heading', { name: TEST_BRAIN_PAGE_TITLE, level: 2 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(
      new RegExp(`/brain/pages/${TEST_BRAIN_PAGE_PUBLIC_ID}$`),
    );
    // The graph is still there under it, with the page still picked — and
    // the tabs still say Graph, although the address is the page's.
    await expect(page.getByTestId('brain-graph')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Graf', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(card).toContainText(TEST_BRAIN_PAGE_TITLE);

    await drawer.getByTestId('brain-page-drawer-close').click();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/brain\/graph\?focus=/);
    await expect(card).toContainText(TEST_BRAIN_PAGE_TITLE);

    // A reload of the page's URL is the full page, with no graph behind it.
    await page.goto(`/pl/brain/pages/${TEST_BRAIN_PAGE_PUBLIC_ID}`);
    await expect(
      page.getByRole('heading', { name: TEST_BRAIN_PAGE_TITLE, level: 2 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('brain-page-drawer')).toHaveCount(0);
    await expect(page.getByTestId('brain-graph')).toHaveCount(0);
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

  /**
   * The operator's assistant (spec 2026-09-25-brain-operator-assistant), over
   * the mock model's one scripted turn: it proposes approving the page on
   * screen and links it; the card's Apply records the approval as the
   * signed-in person. Here, in `smoke-`, because a panel that answers but
   * cannot apply — or applies as someone else — must block the merge.
   *
   * It approves its own seeded page, which the seed recreates on every run.
   */
  test('the assistant proposes a change, and Apply records it as the operator', async ({
    page,
  }) => {
    await page.goto(`/pl/brain/pages/${TEST_BRAIN_ASSISTANT_PAGE_PUBLIC_ID}`);
    await expect(
      page.getByRole('heading', {
        name: TEST_BRAIN_ASSISTANT_PAGE_TITLE,
        level: 2,
      }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByTestId('brain-assistant-toggle').click();
    const panel = page.getByTestId('brain-assistant-panel');
    await expect(
      panel.getByTestId('brain-assistant-prompt').first(),
    ).toBeVisible();

    await panel
      .getByTestId('brain-assistant-input')
      .fill('Czy tę stronę można zatwierdzić? zzqx-brain-propose');
    await panel.getByRole('button', { name: 'Wyślij' }).click();

    const card = panel.getByTestId('brain-proposal');
    await expect(card).toContainText('Zatwierdź tę stronę', { timeout: 30000 });
    await expect(panel.getByTestId('brain-assistant-link')).toHaveAttribute(
      'href',
      new RegExp(`/brain/pages/${TEST_BRAIN_ASSISTANT_PAGE_PUBLIC_ID}$`),
    );

    await card.getByRole('button', { name: 'Zastosuj' }).click();
    await expect(card.getByTestId('brain-proposal-outcome')).toContainText(
      'Zastosowano',
      { timeout: 15000 },
    );
    await expect(page.getByText('Zatwierdzona', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    const history = page.getByTestId('brain-decisions');
    await expect(history).toContainText('Zatwierdzono');
    await expect(history).toContainText(TEST_USER_NAME);
  });
});
