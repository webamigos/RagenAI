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
 *
 *      For `apps/admin`, add its own origin as well:
 *        BETTER_AUTH_URL="http://localhost:3200"
 *      Better Auth takes that variable as its base URL, and the root
 *      `.env.local` sets it to port 3000 for the app. Without the override
 *      every sign-in here answers "Invalid origin" and the run dies in
 *      `signIn()` on a navigation timeout that says nothing about why.
 *   2. Seed the states the pages need:
 *        psql "postgresql://postgres:pass123@localhost:55432/ragen_e2e" \
 *          -f scripts/screenshots/demo-data.sql
 *   3. Start it: `npm run admin:dev` or `npm run web:dev`.
 *      `web`'s knowledge base reads its folders through apps/api, so
 *      `npm run api:dev` has to be up for that shot as well — pointed at the
 *      same database. Without it the rail simply renders no folders.
 *   4. `npx tsx scripts/screenshots/capture.mts [admin|web|all] [shot...]`
 *
 * With no argument it captures both, which is what CI-less regeneration
 * wants; naming one app, and optionally the shots within it, is for iterating
 * on a single page without waiting for — or rewriting — fifteen others.
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
 * points at `docs/img/admin/…`. So `static/img/admin` sat empty and
 * regenerating the screenshots changed nothing anybody could see, which is
 * why the committed captures still carried an old logo: the one command that
 * would have refreshed them was writing somewhere else.
 */
function outDir(app: string): string {
  // `scripts/screenshots/` → the repository's own `docs/img/`, which is what
  // the README embeds. It used to be one level up, when this lived inside the
  // Docusaurus site that has since moved to its own repository.
  return join(import.meta.dirname, '..', '..', 'docs', 'img', app);
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
  /**
   * Text that must be on screen before the shutter opens.
   *
   * `needsApi` documents a dependency; this one enforces it. A page whose
   * companion service is down does not always render an error — the knowledge
   * base catches the failed folder fetch and renders its rail without a
   * FOLDERS section at all, which photographs as a feature that does not
   * exist. The failure check below cannot see that: nothing failed, half the
   * rail simply was not there.
   *
   * Every shot is captured in English, so English text is the right thing to
   * wait for.
   */
  requires?: { text: string; reason: string };
  /**
   * A human placed this image deliberately, so the script leaves it alone.
   *
   * The script owns `docs/img/**` by default and that is the right default —
   * a generated screenshot cannot drift from the product. But a hand-placed
   * image sometimes carries something a live capture cannot: a design target
   * the product has not reached yet, or a demo state richer than the seeded
   * one. Overwriting those silently is how the effort behind them disappears.
   *
   * The value is the reason, printed on every run so a stale exception is
   * visible rather than forgotten. Delete the flag to hand the shot back to
   * the script.
   */
  manual?: string;
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
/**
 * Three of these are hand-placed design-system v2 targets rather than captures.
 * They come from the Claude Design handoff in
 * `apps/web/design_handoff_ragen_panel/` and show the panel as it is being
 * rebuilt, with demo content the seeded state does not have. Drop the `manual`
 * flag on each as its phase lands and the capture becomes truthful again.
 */
const WEB_SHOTS: Shot[] = [
  {
    name: 'chat',
    path: '/en/new',
    full: true,
    manual: 'design-system v2 target — phases 5 and 6 (composer, sources)',
  },
  // Phase 7 landed (#1053, #1057, #1068, #1070 and the follow-up that closed
  // the selection bar, the heading totals and the filter row), so this one is
  // a capture again. `needsApi` because the rail's folders come from
  // apps/api — the page renders without it, minus the half the rail is for.
  {
    name: 'knowledge-base',
    path: '/en/knowledge',
    needsApi: true,
    requires: {
      text: 'Folders',
      reason: 'the rail\'s folders come from apps/api, and the page renders without them',
    },
  },
  // `/assistants` redirects here — the two names are one page, and
  // capturing both produced byte-identical images.
  {
    name: 'projects',
    path: '/en/projects',
    manual: 'design-system v2 target — phase 3 (primitives)',
  },
  {
    name: 'settings-general',
    path: '/en/settings/general',
    manual: 'design-system v2 target — phase 8 (merged settings surface)',
  },
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

/**
 * Next's development overlay, hidden.
 *
 * `next dev` mounts a fixed-position indicator in a `<nextjs-portal>` custom
 * element. It floats over the bottom-right corner of whatever is being
 * photographed, so it lands *inside* a `<main>`-clipped shot — and a badge
 * reading "1 Issue" over the documentation's screenshot of the knowledge base
 * says the product has a problem, when what it has is a development server.
 */
const HIDE_DEV_OVERLAY = 'nextjs-portal { display: none !important; }';

async function capture(page: Page, app: App, shot: Shot): Promise<void> {
  await page.goto(`${app.baseUrl}${shot.path}`, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY });

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

  // What this shot exists to show, present before it is taken.
  if (shot.requires) {
    const required = main.getByText(shot.requires.text, { exact: false });
    try {
      await required.first().waitFor({ state: 'visible', timeout: 30_000 });
    } catch {
      throw new Error(
        `"${shot.requires.text}" never appeared — ${shot.requires.reason}`,
      );
    }
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

/**
 * Shot names given after the app, or every shot when none are.
 *
 * A run rewrites every image it captures, so regenerating one page after one
 * change otherwise puts fifteen files in `git status` and leaves the author
 * deciding which of them moved for a reason. Naming the shot keeps the diff
 * to the thing that changed.
 *
 *   npx tsx scripts/screenshots/capture.mts web knowledge-base
 *
 * Shot names need a single app, not `all` — they are that app's names.
 */
function selectedShots(app: App): Shot[] {
  const names = process.argv.slice(3);
  if (names.length === 0) {
    return app.shots;
  }

  // Shot names belong to one app. `all knowledge-base` would otherwise ask
  // the admin panel for a shot it has never had and die on the check below,
  // after capturing part of a run.
  if ((process.argv[2] ?? 'all') === 'all') {
    throw new Error(
      'Naming shots needs a single app: ' +
        `capture.mts ${APPS.map((candidate) => candidate.key).join('|')} <shot...>`,
    );
  }

  const chosen = app.shots.filter((shot) => names.includes(shot.name));
  const unknown = names.filter(
    (name) => !app.shots.some((shot) => shot.name === name),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Unknown shot(s) for "${app.key}": ${unknown.join(', ')}. ` +
        `Known: ${app.shots.map((shot) => shot.name).join(', ')}.`,
    );
  }
  return chosen;
}

async function main(): Promise<void> {
  /*
    Arguments first, browser second. `selectedShots` throws on a name the app
    does not have, and resolving it inside the loop meant a typo cost a
    chromium launch and a sign-in — up to two minutes against a cold `next
    dev` — before anything said the word was wrong.
  */
  const plan = selectedApps().map((app) => ({
    app,
    shots: selectedShots(app),
  }));

  const browser = await chromium.launch();

  try {
    for (const { app, shots } of plan) {
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
        for (const shot of shots) {
          // Printed rather than passed over in silence: an exception nobody
          // sees is an exception nobody removes, and these are meant to end.
          if (shot.manual) {
            console.log(`  ${shot.name}.png KEPT (manual): ${shot.manual}`);
            continue;
          }
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

// ---------------------------------------------------------------------------
// Demo mode: marketing screenshots from the Nordwind Logistics seed
// ---------------------------------------------------------------------------
//
//   npx tsx scripts/screenshots/capture.mts demo --locale pl [--out <dir>] [shot...]
//   npx tsx scripts/screenshots/capture.mts demo --locale en [--out <dir>] [shot...]
//   npx tsx scripts/screenshots/capture.mts demo-admin [--out <dir>] [shot...]
//
// The documentation shots above are clipped to `<main>` and sized to their
// content. These are for the marketing site, so they are the opposite: the
// whole window, sidebar included, at a fixed viewport, captured at
// deviceScaleFactor 2 and then resized to an exact target in pixels with
// sharp. Each shot is written twice — `<name>.png` (lossless, at the target
// size) and `<name>.webp` (quality 82) — into `<out>/<locale>/`.
//
// ## What it runs against
//
// The `ragen_demo` database, seeded by `scripts/demo/seed-nordwind.ts` (read
// `scripts/demo/README.md` first). Production builds, not dev servers:
//
//   DATABASE_URL=…/ragen_demo DATABASE_DIRECT_URL=…/ragen_demo \
//     next start --port 3000                       # apps/web
//   DATABASE_URL=…/ragen_demo DATABASE_DIRECT_URL=…/ragen_demo PORT=3001 \
//     node apps/api/dist/main.js                    # the thread sidebar and analytics
//   ADMIN_TRUSTED_ORIGINS=http://localhost:3200 BETTER_AUTH_URL=http://localhost:3200 \
//     DATABASE_URL=…/ragen_demo next start --port 3200   # apps/admin
//
// apps/api must be given `ragen_demo` explicitly: started bare it falls
// through to the root `.env.local` and answers from the development database
// (see `.claude/skills/ragen-e2e-triage/SKILL.md`).
//
// ## Credentials
//
// `SCREENSHOT_EMAIL` / `SCREENSHOT_PASSWORD`, as for the documentation shots.
// Unset, each locale signs in as its organization's owner — Anna, who owns
// every showcase thread — with the password the seed gives every account.
// These are fixtures committed in `scripts/demo/README.md`, not secrets.
//
// ## Ids
//
// The seed derives every id from a stable key (`stableUuid`), so a thread, a
// Brain page or a document version keeps its URL across re-seeds. That is
// what makes it safe to name them here. If a re-seed ever changes one, the
// shot fails on its `requires` text instead of photographing the wrong page.

const DEMO_PASSWORD = 'NordwindDemo2026!';

type DemoLocale = 'pl' | 'en';

/** Stable seed ids, per locale. See "Ids" above. */
const DEMO_IDS: Record<
  DemoLocale,
  {
    leaveThread: string;
    supportThread: string;
    salesAssistant: string;
    hrFolder: string;
    remoteWorkDoc: string;
    remoteWorkV1: string;
    remoteWorkV2: string;
    annualLeavePage: string;
  }
> = {
  pl: {
    leaveThread: 'f8e09b91-c34c-43c2-ae12-631deb68b6b8',
    supportThread: 'c1b689ba-0415-4f05-ae55-aee600933e1a',
    salesAssistant: '84895fda-58d5-4f81-9990-f09a844bb37b',
    hrFolder: '4785e839-b212-4a02-ba49-f4a00799309c',
    remoteWorkDoc: '3f22f6dd-8d38-4e60-ab0a-1e6fceb2ea37',
    remoteWorkV1: '344c0281-5c63-40ab-9a0c-bab90b9d9ace',
    remoteWorkV2: '977d88b0-f86c-4666-b7f4-8dde151dd8cc',
    annualLeavePage: 'ca0cbd71-d8a7-4845-a737-baa00de7a3ce',
  },
  en: {
    leaveThread: '3c48d0fa-a91a-42e9-8fdb-7c6861923a4a',
    supportThread: 'ebb30d12-2c2d-46e6-92fb-2efb1614ff65',
    salesAssistant: '24d35460-8400-4a4e-ad1b-c3a17d7ec46a',
    hrFolder: 'bd9c34d6-3459-4376-abd5-b9ff52106b58',
    remoteWorkDoc: '71ad4c58-c1c7-4b74-b4c1-dced98464f90',
    remoteWorkV1: 'b54da094-c68b-4eab-a5f3-33d1aac595e0',
    remoteWorkV2: '2c993b37-a6fe-43d0-961d-75825ba7c254',
    annualLeavePage: 'bc13dcca-2f80-4ef7-9b7a-340ffdaae24d',
  },
};

/** UI strings the shots click or wait for, in each locale. */
const DEMO_TEXT: Record<
  DemoLocale,
  {
    sources: string;
    instructions: string;
    extract: string;
    brainPage: string;
    payroll: string;
    staged: string;
    analytics: string;
    findings: string;
  }
> = {
  pl: {
    sources: 'Źródła',
    instructions: 'Instrukcje',
    extract: 'Wyodrębnij z dokumentów',
    brainPage: 'Strona Brain',
    payroll: 'Płace',
    staged: 'Instrukcja_ADR_projekt.docx',
    analytics: 'Analityka wiedzy',
    findings: 'Sprzeczność',
  },
  en: {
    sources: 'Sources',
    instructions: 'Instructions',
    extract: 'Extract from documents',
    brainPage: 'Brain page',
    payroll: 'Payroll',
    staged: 'ADR_Dangerous_Goods_Draft.docx',
    analytics: 'Knowledge analytics',
    findings: 'Contradiction',
  },
};

type Size = { width: number; height: number };

type DemoShot = {
  name: string;
  path: (locale: DemoLocale) => string;
  /** CSS viewport. */
  viewport: Size;
  /** Final pixels, after the deviceScaleFactor-2 capture is resized. */
  target: Size;
  /** A phone: touch, mobile user agent. */
  mobile?: boolean;
  /** Text that must be visible before the shutter opens. */
  requires?: (locale: DemoLocale) => string;
  prepare?: (page: Page, locale: DemoLocale) => Promise<void>;
};

const DESKTOP = { width: 1440, height: 960 };
const DESKTOP_WIDE = { width: 1440, height: 900 };
const TARGET = { width: 2000, height: 1334 };
const TARGET_WIDE = { width: 2400, height: 1500 };

/**
 * The sources rail follows the newest answer and remembers whether it was
 * open, so a fresh browser context can find it either way. Open it.
 */
async function openSourcesRail(page: Page, locale: DemoLocale): Promise<void> {
  const rail = page.locator(`aside[aria-label="${DEMO_TEXT[locale].sources}"]`);
  if (!(await rail.isVisible().catch(() => false))) {
    await page.locator('button[aria-pressed]').first().click();
  }
  await rail.waitFor({ state: 'visible', timeout: 15_000 });
}

async function closeSourcesRail(page: Page, locale: DemoLocale): Promise<void> {
  const rail = page.locator(`aside[aria-label="${DEMO_TEXT[locale].sources}"]`);
  if (await rail.isVisible().catch(() => false)) {
    await rail.locator('button').first().click();
    await rail.waitFor({ state: 'hidden', timeout: 5_000 });
  }
}

/**
 * Selects a row in the knowledge base table by its file name. The checkbox is
 * a Radix `button[role=checkbox]` in some builds and a native input in others.
 */
async function tickRow(page: Page, fileName: string): Promise<void> {
  await page
    .locator('tr', { hasText: fileName })
    .first()
    .locator('button[role=checkbox], input[type=checkbox]')
    .first()
    .click();
}

/**
 * Scrolls the conversation so the element holding `text` sits at `ratio` of
 * its scroll container's height. Not `scrollIntoView`: that scrolls every
 * ancestor, the document included, and pushed the app's header off the top
 * of the frame.
 */
async function scrollIntoViewWithin(
  page: Page,
  text: string,
  ratio: number,
): Promise<void> {
  await page
    .getByText(text, { exact: false })
    .first()
    .evaluate((el, r) => {
      let box: HTMLElement | null = el.parentElement;
      while (box) {
        const style = getComputedStyle(box);
        if (/(auto|scroll)/.test(style.overflowY) && box.scrollHeight > box.clientHeight) {
          break;
        }
        box = box.parentElement;
      }
      if (!box) {
        return;
      }
      const offset =
        el.getBoundingClientRect().top - box.getBoundingClientRect().top;
      box.scrollTop += offset - box.clientHeight * r;
      window.scrollTo(0, 0);
    }, ratio);
}

const DEMO_SHOTS: DemoShot[] = [
  {
    name: 'hero-chat-citations',
    path: (l) => `/${l}/chats/${DEMO_IDS[l].leaveThread}`,
    viewport: DESKTOP_WIDE,
    target: TARGET_WIDE,
    requires: (l) => DEMO_TEXT[l].brainPage,
    prepare: openSourcesRail,
  },
  {
    // No showcase thread carries a connector answer — connectors are seeded
    // without tokens — so this is the support thread: three citations, one of
    // them a web page and one a Brain page.
    name: 'assistant-chat',
    path: (l) => `/${l}/chats/${DEMO_IDS[l].supportThread}`,
    viewport: DESKTOP,
    target: TARGET,
    requires: (l) => DEMO_TEXT[l].brainPage,
    prepare: openSourcesRail,
  },
  {
    name: 'assistants',
    path: (l) => `/${l}/assistants`,
    viewport: DESKTOP,
    target: TARGET,
  },
  {
    // There is no sharing dialog for a folder: `ShareDialog` accepts
    // `resourceType: 'folder'` but nothing opens it, and a folder's team is
    // chosen only when it is created. What the product shows of the HR ▸
    // Payroll restriction is the team badge on the folder row, so that is
    // the shot.
    name: 'kb-permissions',
    path: (l) =>
      `/${l}/knowledge/documents-list?folderId=${DEMO_IDS[l].hrFolder}&viewMode=all&page=1`,
    viewport: DESKTOP,
    target: TARGET,
    requires: (l) => DEMO_TEXT[l].payroll,
  },
  {
    name: 'assistant-settings',
    path: (l) => `/${l}/projects/${DEMO_IDS[l].salesAssistant}`,
    viewport: DESKTOP,
    target: TARGET,
    prepare: async (page, l) => {
      await page.locator(`[aria-label="${DEMO_TEXT[l].instructions}"]`).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible' });
      // The instruction loads after the dialog opens.
      await dialog
        .locator('textarea')
        .filter({ hasText: /\S/ })
        .or(dialog.locator('textarea:not(:placeholder-shown)'))
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 });
    },
  },
  {
    name: 'kb-documents',
    path: (l) => `/${l}/knowledge/documents-list`,
    viewport: DESKTOP,
    target: TARGET,
  },
  {
    // The optimize tab has nothing to show until a model has produced
    // suggestions, and the seed records none; the version diff is the part of
    // document versioning that the seeded data does carry.
    name: 'kb-optimize',
    path: (l) =>
      `/${l}/knowledge/documents/${DEMO_IDS[l].remoteWorkDoc}/diff?v1=${DEMO_IDS[l].remoteWorkV1}&v2=${DEMO_IDS[l].remoteWorkV2}`,
    viewport: DESKTOP,
    target: TARGET,
  },
  {
    name: 'kb-analytics',
    path: (l) => `/${l}/settings/knowledge-analytics`,
    viewport: DESKTOP,
    target: TARGET,
    requires: (l) => DEMO_TEXT[l].analytics,
    prepare: async (page) => {
      // Recharts draws after layout; the line path is what matters.
      await page
        .locator('.recharts-area-area, .recharts-line-curve, .recharts-surface')
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 });
    },
  },
  {
    name: 'mobile-chat',
    path: (l) => `/${l}/chats/${DEMO_IDS[l].leaveThread}`,
    viewport: { width: 390, height: 844 },
    target: { width: 780, height: 1688 },
    mobile: true,
    prepare: async (page, l) => {
      // Bring the answer's end and its sources into view: the first screen
      // is the question and the first paragraph, which says less.
      await scrollIntoViewWithin(page, DEMO_TEXT[l].brainPage, 0.62);
    },
  },
  {
    name: 'brain-pages',
    path: (l) => `/${l}/brain`,
    viewport: DESKTOP_WIDE,
    target: TARGET_WIDE,
  },
  {
    name: 'brain-page',
    path: (l) => `/${l}/brain/pages/${DEMO_IDS[l].annualLeavePage}`,
    viewport: DESKTOP,
    target: TARGET,
  },
  {
    name: 'brain-findings',
    path: (l) => `/${l}/brain/findings`,
    viewport: DESKTOP,
    target: TARGET,
    requires: (l) => DEMO_TEXT[l].findings,
  },
  {
    // ForceAtlas2 runs synchronously before Sigma's first frame, so once the
    // canvas has painted the layout is final; the wait is for WebGL.
    name: 'brain-graph',
    path: (l) => `/${l}/brain/graph`,
    viewport: DESKTOP_WIDE,
    target: TARGET_WIDE,
    prepare: async (page) => {
      await page.getByTestId('brain-graph').locator('canvas').first().waitFor();
      await page.waitForTimeout(2_000);
    },
  },
  {
    // The same graph around one page, with its card open: every name legible,
    // which the whole-graph view at 46 pages is not.
    name: 'brain-graph-focus',
    path: (l) => `/${l}/brain/graph?focus=${DEMO_IDS[l].annualLeavePage}&hops=2`,
    viewport: DESKTOP_WIDE,
    target: TARGET_WIDE,
    prepare: async (page) => {
      await page.getByTestId('brain-graph').locator('canvas').first().waitFor();
      await page.getByTestId('brain-graph-card').waitFor();
      await page.waitForTimeout(2_000);
    },
  },
  {
    name: 'brain-documents',
    path: (l) => `/${l}/brain/documents`,
    viewport: DESKTOP,
    target: TARGET,
    requires: (l) => DEMO_TEXT[l].staged,
  },
  {
    name: 'brain-extract',
    path: (l) => `/${l}/brain`,
    viewport: DESKTOP,
    target: TARGET,
    prepare: async (page, l) => {
      await page.getByRole('button', { name: DEMO_TEXT[l].extract }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible' });
      // The dialog pre-ticks the documents no page cites yet; add two that
      // are already extracted, so it reads as a choice rather than a default.
      // Positions differ per locale (the list is alphabetical), so pick by
      // state rather than by index: the 1st and 8th boxes still unticked.
      const unticked = dialog.locator(
        'button[role=checkbox][aria-checked=false], input[type=checkbox]:not(:checked)',
      );
      await unticked.nth(7).click();
      await unticked.nth(0).click();
    },
  },
  {
    name: 'chat-brain-citation',
    path: (l) => `/${l}/chats/${DEMO_IDS[l].leaveThread}`,
    viewport: DESKTOP,
    target: TARGET,
    requires: (l) => DEMO_TEXT[l].brainPage,
    prepare: async (page, l) => {
      await closeSourcesRail(page, l);
      await scrollIntoViewWithin(page, DEMO_TEXT[l].brainPage, 0.55);
    },
  },
  {
    name: 'kb-staged',
    path: (l) => `/${l}/knowledge/documents-list`,
    viewport: DESKTOP,
    target: TARGET,
    requires: (l) => DEMO_TEXT[l].staged,
    prepare: (page, l) => tickRow(page, DEMO_TEXT[l].staged),
  },
];

const ADMIN_VIEWPORT = { width: 1600, height: 1000 };

/** apps/admin is English-only: captured once, copied into every locale. */
const DEMO_ADMIN_SHOTS: DemoShot[] = [
  { name: 'admin-usage', path: () => '/ai-usage' },
  { name: 'admin-models', path: () => '/models' },
  { name: 'admin-users', path: () => '/users' },
  { name: 'admin-limits', path: () => '/limits' },
  { name: 'admin-guardrails', path: () => '/guardrails' },
  { name: 'admin-audit', path: () => '/activity-log' },
].map((shot) => ({ ...shot, viewport: ADMIN_VIEWPORT, target: TARGET_WIDE }));

/**
 * Hidden on every demo shot. None of it is product: Next's dev indicator, the
 * toast region (a "signed in" toast would otherwise sit in the corner of the
 * first shot), and the text caret in whichever field has focus.
 */
const DEMO_HIDE = `
  nextjs-portal,
  [data-sonner-toaster],
  section[aria-label^="Notifications"] { display: none !important; }
  * { caret-color: transparent !important; }
`;

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

/** Positional shot names after the mode, with `--flag value` pairs removed. */
function demoShotNames(): string[] {
  const names: string[] = [];
  for (let i = 3; i < process.argv.length; i += 1) {
    if (process.argv[i].startsWith('--')) {
      i += 1;
      continue;
    }
    names.push(process.argv[i]);
  }
  return names;
}

function pickDemoShots(all: DemoShot[]): DemoShot[] {
  const names = demoShotNames();
  if (names.length === 0) {
    return all;
  }
  const unknown = names.filter((n) => !all.some((s) => s.name === n));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown demo shot(s): ${unknown.join(', ')}. Known: ${all.map((s) => s.name).join(', ')}.`,
    );
  }
  return all.filter((s) => names.includes(s.name));
}

/** Waits for the page to stop moving: network, skeletons, spinners, fonts. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('.animate-pulse, .animate-spin, [aria-busy="true"]')].every(
          (el) => {
            const box = el.getBoundingClientRect();
            return box.width === 0 || box.height === 0;
          },
        ),
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => {
      console.warn('    (a skeleton or spinner was still visible after 20s)');
    });
  await page.evaluate(() => document.fonts.ready);
}

async function writeDemoImage(
  png: Buffer,
  target: Size,
  dirs: string[],
  name: string,
): Promise<void> {
  const { default: sharp } = await import('sharp');
  const resized = sharp(png).resize(target.width, target.height, {
    fit: 'cover',
    position: 'top',
    kernel: 'lanczos3',
  });
  const master = await resized.clone().png({ compressionLevel: 9 }).toBuffer();
  const webp = await sharp(master).webp({ quality: 82 }).toBuffer();
  const { writeFileSync } = await import('node:fs');
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.png`), master);
    writeFileSync(join(dir, `${name}.webp`), webp);
  }
}

async function demoMain(): Promise<void> {
  const admin = process.argv[2] === 'demo-admin';
  const locale = (flag('locale') ?? 'pl') as DemoLocale;
  if (!admin && locale !== 'pl' && locale !== 'en') {
    throw new Error(`--locale must be pl or en, not "${locale}".`);
  }
  const out = flag('out') ?? join(import.meta.dirname, '..', '..', 'screens-out');
  const shots = pickDemoShots(admin ? DEMO_ADMIN_SHOTS : DEMO_SHOTS);

  const baseUrl = admin
    ? (process.env.ADMIN_URL ?? 'http://localhost:3200')
    : (process.env.WEB_URL ?? 'http://localhost:3000');
  const email =
    process.env.SCREENSHOT_EMAIL ??
    (admin
      ? 'platform-admin@nordwind-logistics.example'
      : locale === 'pl'
        ? 'anna.kowalska@nordwind-logistics.example'
        : 'anna.walker@nordwind-logistics.example');
  const password = process.env.SCREENSHOT_PASSWORD ?? DEMO_PASSWORD;
  const dirs = admin ? [join(out, 'en'), join(out, 'pl')] : [join(out, locale)];

  const browser = await chromium.launch();
  const failed: string[] = [];
  try {
    // One signed-in session, reused by the phone context through its cookies.
    const base = await browser.newContext({
      viewport: DESKTOP,
      deviceScaleFactor: 2,
      colorScheme: 'light',
      locale: locale === 'pl' && !admin ? 'pl-PL' : 'en-GB',
      timezoneId: 'Europe/Warsaw',
    });
    const signInPage = await base.newPage();
    await signInPage.goto(`${baseUrl}${admin ? '/login' : `/${locale}/sign-in`}`, {
      waitUntil: 'domcontentloaded',
    });
    await signInPage.locator('input[type="email"]').fill(email);
    await signInPage.locator('input[type="password"]').fill(password);
    await signInPage.locator('button[type="submit"]').click();
    await signInPage.waitForURL(
      (url) => !url.pathname.includes('sign-in') && !url.pathname.startsWith('/login'),
      { timeout: 120_000 },
    );
    const storageState = await base.storageState();
    await signInPage.close();
    console.log(`[demo${admin ? '-admin' : ` ${locale}`}] signed in as ${email}. Writing to ${dirs.join(', ')}:`);

    for (const shot of shots) {
      const context = shot.mobile
        ? await browser.newContext({
            viewport: shot.viewport,
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
            colorScheme: 'light',
            locale: locale === 'pl' ? 'pl-PL' : 'en-GB',
            timezoneId: 'Europe/Warsaw',
            storageState,
          })
        : base;
      const page = await context.newPage();
      await page.setViewportSize(shot.viewport);
      try {
        await page.goto(`${baseUrl}${shot.path(locale)}`, {
          waitUntil: 'networkidle',
          timeout: 120_000,
        });
        await page.addStyleTag({ content: DEMO_HIDE });
        await settle(page);

        const failure = await page
          .getByText(/failed to load|something went wrong|nie udało się załadować|coś poszło nie tak/i)
          .first()
          .isVisible()
          .catch(() => false);
        if (failure) {
          throw new Error('page rendered an error state — is apps/api up, on ragen_demo?');
        }
        if (shot.requires) {
          const text = shot.requires(locale);
          await page
            .getByText(text, { exact: false })
            .first()
            .waitFor({ state: 'visible', timeout: 30_000 })
            .catch(() => {
              throw new Error(`"${text}" never appeared — wrong org, or a re-seed moved an id?`);
            });
        }
        // The sidebar's recent threads come from apps/api. A throttled
        // (429) or misconfigured apps/api renders them as an empty state,
        // which photographs as an account with no history.
        const noThreads = await page
          .getByText(/^(Brak wątków|No threads)$/)
          .first()
          .isVisible()
          .catch(() => false);
        if (noThreads) {
          throw new Error(
            'the sidebar rendered no threads — apps/api throttled (start it with TARGET_ENV=test) or on the wrong database',
          );
        }
        await shot.prepare?.(page, locale);
        await settle(page);
        // Nothing hovered, nothing focused: a hover card or a focus ring is a
        // state of this run, not of the product.
        await page.mouse.move(0, shot.viewport.height - 1);
        await page.waitForTimeout(700);

        const png = await page.screenshot({ type: 'png' });
        await writeDemoImage(png, shot.target, dirs, shot.name);
        console.log(`  ${shot.name} ${shot.target.width}×${shot.target.height}`);
      } catch (error) {
        failed.push(shot.name);
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`  ${shot.name} SKIPPED: ${reason.split('\n')[0]}`);
      } finally {
        await page.close();
        if (context !== base) {
          await context.close();
        }
      }
    }
    await base.close();
  } finally {
    await browser.close();
  }
  if (failed.length > 0) {
    console.warn(`${failed.length} not captured: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

if (process.argv[2] === 'demo' || process.argv[2] === 'demo-admin') {
  await demoMain();
} else {
  await main();
}
