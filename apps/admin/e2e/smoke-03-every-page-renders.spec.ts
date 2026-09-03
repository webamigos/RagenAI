import { expect, test } from '@playwright/test';

import { ROUTES } from './constants';

/**
 * Every page renders for a platform administrator, with no console error.
 *
 * Cheap and worth it: all of these are `force-dynamic`, so `next build`
 * proves the route table and nothing about whether the page actually queries
 * successfully. A missing column or a bad `include` is a runtime 500 that no
 * unit test and no build would catch.
 */

const PAGES: [keyof typeof ROUTES, string][] = [
  ['dashboard', 'Dashboard'],
  ['users', 'Users'],
  ['organizations', 'Organizations'],
  ['invitations', 'Invitations'],
  ['features', 'Features'],
  ['plans', 'Subscription Plans'],
  ['limits', 'Limits Management'],
  ['models', 'Models Management'],
  ['connectors', 'Connectors Management'],
  ['connectorHealth', 'Connector Health'],
  ['ragSettings', 'RAG Settings'],
  ['assistantTemplates', 'Global Assistants'],
  ['templateAccess', 'Assistants Access Management'],
  ['apiKeys', 'API Keys'],
  ['defaults', 'Apply Defaults'],
  ['proxy', 'Proxy'],
  ['aiUsage', 'AI Usage'],
  ['diskUsage', 'Disk Usage'],
  ['activityLog', 'Activity Log'],
  ['incidents', 'Security Incidents'],
];

for (const [route, heading] of PAGES) {
  test(`${route} renders`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });

    const response = await page.goto(ROUTES[route]);

    expect(
      response?.status(),
      `${route} returned an error status`,
    ).toBeLessThan(400);
    // Scoped to `main`: the sidebar brand is also an `h1`, so an unscoped
    // level-1 query matches two elements and fails strict mode. (That the
    // sidebar uses `h1` at all is a separate accessibility smell.)
    const pageHeading = page.locator('main').getByRole('heading', { level: 1 });
    await expect(pageHeading, `${route} rendered no h1`).toBeVisible({
      timeout: 20_000,
    });

    // Heading text is asserted loosely — the point is the page loaded its
    // data, not that nobody may ever reword a title.
    const h1 = await pageHeading.first().innerText();
    expect(h1.length, `${route} rendered an empty h1`).toBeGreaterThan(0);

    const realErrors = errors.filter(
      // The dev server's HMR socket is not part of the page.
      (text) => !text.includes('webpack-hmr') && !text.includes('WebSocket'),
    );
    expect(realErrors, `${route} logged console errors`).toEqual([]);

    // Keeps the expected-heading table honest without making it brittle:
    // a rename shows up here as a readable diff rather than a mystery.
    expect.soft(h1, `${route} heading changed`).toBe(heading);
  });
}
