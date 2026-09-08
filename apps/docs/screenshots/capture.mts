/**
 * Regenerate the screenshots used by the documentation site and the
 * repository README — the admin panel and the app itself.
 *
 * A script rather than a one-off session, because screenshots rot faster than
 * prose: a renamed column or a moved button makes an image wrong while every
 * word around it stays true. This can be re-run after any change to the
 * panel, and the diff in `git status` shows which pages actually moved.
 *
 * ## Running it
 *
 *   1. Point the app you are capturing at the e2e database, in its own
 *      `.env.local` (`apps/admin/` or `apps/web/`):
 *        DATABASE_URL="postgresql://postgres:pass123@localhost:55432/ragen_e2e"
 *        DATABASE_DIRECT_URL="postgresql://postgres:pass123@localhost:55432/ragen_e2e"
 *   2. Seed the states the pages need:
 *        psql "postgresql://postgres:pass123@localhost:55432/ragen_e2e" \
 *          -f apps/docs/screenshots/demo-data.sql
 *   3. Start it: `npm run admin:dev` or `npm run web:dev`
 *   4. `npx tsx apps/docs/screenshots/capture.mts [admin|web|all]`
 *
 * With no argument it captures both, which is what CI-less regeneration
 * wants; naming one is for iterating on a single page without waiting for
 * fifteen others.
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

/** Committed E2E fixtures, shared by both apps. See `apps/web/e2e/constants.ts`. */
const EMAIL = process.env.SCREENSHOT_EMAIL ?? 'e2e-test@ragen.ai';
const PASSWORD = process.env.SCREENSHOT_PASSWORD ?? 'E2eTestPassword123!';

/**
 * `docs/img/<app>`, not `static/img/<app>`.
 *
 * This script wrote to `static/` while every consumer read from `docs/` —
 * `admin-panel.md` references `./img/admin/…` relatively, and the README
 * points at `apps/docs/docs/img/admin/…`. So `static/img/admin` sat empty and
 * regenerating the screenshots changed nothing anybody could see, which is
 * why the committed captures still carried an old logo: the one command that
 * would have refreshed them was writing somewhere else.
 */
function outDir(app: string): string {
  return join(import.meta.dirname, '..', 'docs', 'img', app);
}

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
  /**
   * Renders server-side data fetched from `apps/api`. Without that service
   * running the page throws instead of rendering, so the shot is skipped with
   * a note rather than failing the run.
   */
  needsApi?: boolean;
};

const ADMIN_SHOTS: Shot[] = [
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

/**
 * The app a customer uses, in English — the documentation is English, and the
 * locale prefix is not optional on these routes.
 *
 * Settings carry the most weight here. They are where a reader decides
 * whether Ragen does what they need, and until now the documentation showed
 * them the operator's panel and nothing of the surface their own users see.
 */
const WEB_SHOTS: Shot[] = [
  { name: 'chat', path: '/en/new', full: true },
  { name: 'knowledge-base', path: '/en/knowledge' },
  // `/assistants` redirects here — the two names are one page, and
  // capturing both produced byte-identical images.
  { name: 'projects', path: '/en/projects' },
  { name: 'settings-general', path: '/en/settings/general' },
  { name: 'settings-account', path: '/en/settings/account' },
  {
    name: 'settings-connectors',
    path: '/en/settings/connectors',
    needsApi: true,
  },
  { name: 'settings-pii-policy', path: '/en/settings/pii-policy' },
  {
    name: 'settings-knowledge-analytics',
    path: '/en/settings/knowledge-analytics',
    needsApi: true,
  },
  {
    name: 'settings-shared-threads',
    path: '/en/settings/shared-threads',
    needsApi: true,
  },
  { name: 'organization-profile', path: '/en/organization/profile' },
];

type App = {
  key: string;
  baseUrl: string;
  shots: Shot[];
  /** Where the sign-in form lives, and how to know it worked. */
  signInPath: string;
  signedIn: (pathname: string) => boolean;
};

const APPS: App[] = [
  {
    key: 'admin',
    baseUrl: process.env.ADMIN_URL ?? 'http://localhost:3200',
    shots: ADMIN_SHOTS,
    signInPath: '/login',
    signedIn: (pathname) => !pathname.startsWith('/login'),
  },
  {
    key: 'web',
    baseUrl: process.env.WEB_URL ?? 'http://localhost:3000',
    shots: WEB_SHOTS,
    // Locale-prefixed, and `/sign-in` without one redirects — going straight
    // to the prefixed route keeps the wait below meaningful.
    signInPath: '/en/sign-in',
    signedIn: (pathname) => !pathname.includes('/sign-in'),
  },
];

async function signIn(page: Page, app: App): Promise<void> {
  await page.goto(`${app.baseUrl}${app.signInPath}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();

  // For the panel, the dashboard layout re-checks the role server-side, so a
  // redirect back to /login means the account exists but is not a platform
  // administrator. For the app it just means the credentials were refused.
  //
  // The timeout is generous on purpose: against `next dev` the first request
  // to a route compiles it, and a cold landing page alone can take most of a
  // minute.
  await page.waitForURL((url) => app.signedIn(url.pathname), {
    timeout: 120_000,
  });
}

async function capture(page: Page, app: App, shot: Shot): Promise<void> {
  await page.goto(`${app.baseUrl}${shot.path}`, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });

  const main = page.locator('main');
  await main.waitFor({ state: 'visible', timeout: 120_000 });
  await shot.prepare?.(page);

  // Refuse to photograph a failure.
  //
  // A page whose data comes from a companion service still *renders* when
  // that service is down — it renders an error state. The height fit then
  // produces a perfectly sharp screenshot of "Failed to load analytics",
  // which is worse in the documentation than no screenshot at all, and
  // nothing about the run would have said so.
  const failure = await main
    .getByText(/failed to load|something went wrong|try again/i)
    .first()
    .isVisible()
    .catch(() => false);
  if (failure) {
    throw new Error(
      'page rendered an error state — is apps/api running, and is the data seeded?',
    );
  }

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

      // The lowest point any visible descendant reaches, measured from the
      // top of `<main>`. Measuring the first child alone works for the
      // panel, where one wrapper holds the page, but not for the app, whose
      // settings pages put a full-height flex column inside `<main>` — that
      // child is as tall as the viewport no matter how little is in it, and
      // every shot came out with the bottom two-fifths blank.
      const top = el.getBoundingClientRect().top;
      let lowest = 0;
      for (const node of el.querySelectorAll('*')) {
        // Leaves only. A layout container is as tall as the space it was
        // given — `flex-1`, `h-full` — so including them measures the frame
        // rather than the content, which is how every shot came back the
        // full viewport height. What actually paints is at the leaves.
        if (node.childElementCount > 0) {
          continue;
        }
        const box = node.getBoundingClientRect();
        if (box.height === 0 || box.width === 0) {
          continue;
        }
        if (getComputedStyle(node).position === 'fixed') {
          continue;
        }
        lowest = Math.max(lowest, box.bottom - top);
      }

      const child = el.firstElementChild;
      const fallback = child
        ? child.getBoundingClientRect().height
        : el.scrollHeight;

      return Math.ceil((lowest > 0 ? lowest : fallback) + padding);
    });
    await page.setViewportSize({
      width: VIEWPORT.width,
      height: Math.min(Math.max(contentHeight, MIN_HEIGHT), MAX_HEIGHT),
    });
    await page.waitForTimeout(300);
  }

  const file = join(outDir(app.key), `${shot.name}.png`);
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

function selectedApps(): App[] {
  const requested = process.argv[2] ?? 'all';
  if (requested === 'all') {
    return APPS;
  }

  const app = APPS.find((candidate) => candidate.key === requested);
  if (!app) {
    throw new Error(
      `Unknown target "${requested}". Use one of: ${APPS.map((a) => a.key).join(', ')}, all.`,
    );
  }
  return [app];
}

async function main(): Promise<void> {
  const browser = await chromium.launch();

  try {
    for (const app of selectedApps()) {
      mkdirSync(outDir(app.key), { recursive: true });

      // A context per app, not per run: the two hold different session
      // cookies for the same account, and reusing one signs the second app
      // out of the first.
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        // Both follow the system theme. Pinning light keeps the images
        // consistent with each other and legible in both docs themes.
        colorScheme: 'light',
      });
      const page = await context.newPage();

      try {
        await signIn(page, app);
        console.log(
          `[${app.key}] signed in as ${EMAIL}. Writing to ${outDir(app.key)}:`,
        );
        const skipped: string[] = [];
        for (const shot of app.shots) {
          try {
            await capture(page, app, shot);
          } catch (error) {
            // One page that will not render should not cost the other ten.
            // The usual cause is a companion service being down — see
            // `needsApi` on Shot — and the run is still worth finishing.
            skipped.push(shot.name);
            const reason =
              error instanceof Error ? error.message : String(error);
            console.warn(
              `  ${shot.name}.png SKIPPED${shot.needsApi ? ' (needs apps/api running)' : ''}: ${reason.split('\n')[0]}`,
            );
          }
        }
        if (skipped.length > 0) {
          console.warn(
            `[${app.key}] ${skipped.length} not captured: ${skipped.join(', ')}`,
          );
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

await main();
