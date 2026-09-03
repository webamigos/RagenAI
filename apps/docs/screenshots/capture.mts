/**
 * Regenerate the admin-panel screenshots used by the documentation site and
 * the repository README.
 *
 * A script rather than a one-off session, because screenshots rot faster than
 * prose: a renamed column or a moved button makes an image wrong while every
 * word around it stays true. This can be re-run after any change to the
 * panel, and the diff in `git status` shows which pages actually moved.
 *
 * ## Running it
 *
 *   1. Point apps/admin at the e2e database. In `apps/admin/.env.local`:
 *        DATABASE_URL="postgresql://postgres:pass123@localhost:55432/ragen_e2e"
 *        DATABASE_DIRECT_URL="postgresql://postgres:pass123@localhost:55432/ragen_e2e"
 *   2. Seed the states the pages need:
 *        psql "postgresql://postgres:pass123@localhost:55432/ragen_e2e" \
 *          -f apps/docs/screenshots/demo-data.sql
 *   3. Start the panel: `npm run admin:dev`
 *   4. `npx tsx apps/docs/screenshots/capture.mts`
 *
 * Credentials come from `apps/web/e2e/constants.ts` — committed test
 * fixtures, not secrets, and the same account the E2E suite signs in with.
 *
 * ## Why most images have no sidebar
 *
 * The navigation is identical on every page, so repeating it eleven times
 * costs horizontal space and tells the reader nothing new. Each page is
 * therefore clipped to its `<main>` element. `dashboard-full.png` is the one
 * exception, kept whole so the documentation can show what the panel looks
 * like and what it contains in a single image.
 *
 * Images are written at deviceScaleFactor 2, so they stay sharp on a retina
 * display and in a README rendered at half width.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const BASE_URL = process.env.ADMIN_URL ?? 'http://localhost:3200';
const OUT_DIR = join(import.meta.dirname, '..', 'static', 'img', 'admin');

/** Committed E2E fixtures. See `apps/web/e2e/constants.ts`. */
const EMAIL = process.env.ADMIN_EMAIL ?? 'e2e-test@ragen.ai';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'E2eTestPassword123!';

/**
 * Wide enough that no table needs horizontal scrolling — the panel's tables
 * carry up to nine columns, and a narrower viewport pushes the Actions column
 * out of frame, which is exactly the column a reader is looking for.
 */
const VIEWPORT = { width: 1600, height: 1200 };

/**
 * Bounds for the per-page height fit below.
 *
 * `<main>` is `flex-1 overflow-y-auto`, so its box is always the height of the
 * viewport regardless of how much is in it. Screenshotting it directly gave
 * every image the same 1200px height — the Activity Log came out roughly
 * four-fifths empty white. So the viewport is resized to the content before
 * each capture. The floor keeps a nearly empty page from becoming a sliver;
 * the ceiling stops a long table from producing an unreadably tall image.
 */
const MIN_HEIGHT = 420;
const MAX_HEIGHT = 2000;

type Shot = {
  name: string;
  path: string;
  /** Capture the whole page including the sidebar. Default is `<main>` only. */
  full?: boolean;
  /** Run before capturing — expand a section, apply a filter. */
  prepare?: (page: Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  { name: 'dashboard-full', path: '/', full: true },
  { name: 'users', path: '/users' },
  { name: 'organizations', path: '/organizations' },
  { name: 'api-keys', path: '/api-keys' },
  { name: 'connector-health', path: '/connector-health' },
  { name: 'apply-defaults', path: '/defaults?group=limits' },
  { name: 'proxy', path: '/proxy' },
  { name: 'limits', path: '/limits' },
  { name: 'models', path: '/models' },
  // With an organization preselected, so the resolution table — the half of
  // this page that explains *why* a flag is on — is actually in frame.
  {
    name: 'features',
    path: '/features?orgId=e2e-test-org-00000-0000-0001',
  },
  { name: 'ai-usage', path: '/ai-usage' },
  { name: 'disk-usage', path: '/disk-usage' },
  { name: 'activity-log', path: '/activity-log' },
  { name: 'incidents', path: '/incidents' },
];

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();

  // The dashboard layout re-checks the role server-side, so a redirect back
  // to /login means the account exists but is not a platform administrator.
  //
  // The timeout is generous on purpose: against `next dev` the first request
  // to a route compiles it, and a cold `/` alone can take most of a minute.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 120_000,
  });
}

async function capture(page: Page, shot: Shot): Promise<void> {
  await page.goto(`${BASE_URL}${shot.path}`, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });

  const main = page.locator('main');
  await main.waitFor({ state: 'visible', timeout: 120_000 });
  await shot.prepare?.(page);

  // Every page is `force-dynamic`, so first paint can precede the data.
  // Settling on the network plus a beat for fonts avoids capturing a page
  // mid-layout, which looks like a bug in the panel rather than in the shot.
  await page.waitForTimeout(600);

  // Fit the frame to the content. See MIN_HEIGHT above for why.
  //
  // Not for the full-page shot: the sidebar is `h-screen`, so shrinking the
  // viewport to the dashboard's short content cropped the navigation list —
  // the one thing that image exists to show.
  if (!shot.full) {
    // Measured on `<main>`'s child rather than on `<main>` itself:
    // `scrollHeight` on a scroll container never reports less than its own
    // box, so a short page measured that way came back as the full 1200 and
    // nothing shrank.
    const contentHeight = await main.evaluate((el) => {
      const style = getComputedStyle(el);
      const padding =
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const child = el.firstElementChild;
      return child
        ? Math.ceil(child.getBoundingClientRect().height + padding)
        : el.scrollHeight;
    });
    await page.setViewportSize({
      width: VIEWPORT.width,
      height: Math.min(Math.max(contentHeight, MIN_HEIGHT), MAX_HEIGHT),
    });
    await page.waitForTimeout(300);
  }

  const file = join(OUT_DIR, `${shot.name}.png`);
  if (shot.full) {
    await page.screenshot({ path: file });
  } else {
    await main.screenshot({ path: file });
  }

  // Back to the reference height: the resize sticks, and the next page would
  // otherwise measure its content inside this page's frame.
  await page.setViewportSize(VIEWPORT);

  console.log(`  ${shot.name}.png`);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    // The panel follows the system theme. Pinning light keeps the images
    // consistent with each other and legible in both docs themes.
    colorScheme: 'light',
  });
  const page = await context.newPage();

  try {
    await signIn(page);
    console.log(`Signed in as ${EMAIL}. Writing to ${OUT_DIR}:`);
    for (const shot of SHOTS) {
      await capture(page, shot);
    }
  } finally {
    await browser.close();
  }
}

await main();
