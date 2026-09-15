import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * No source file carries an analytics or tag-manager id as a literal, and the
 * one surface that measures traffic reads its id from the environment.
 *
 * `apps/web/src/app/[locale]/layout.tsx` used to render
 * `isProductionTargetEnv && <GoogleTagManager gtmId="GTM-…" />` with the
 * vendor's own container id spelled out. Two facts turn that into a data-
 * protection problem rather than a style nit:
 *
 * - the repository is Apache-2.0 and the application is meant to be
 *   self-hosted, so the id ships to every deployment; and
 * - the self-hosting guide tells self-hosters to set `TARGET_ENV=production`,
 *   which is precisely the gate that switched it on.
 *
 * So the default self-hosted install reported its visitors — inside an
 * authenticated product, where the path carries thread and document
 * `publicId`s — to a container the vendor owns. Nobody chose that.
 *
 * Measuring traffic is a vendor concern, and it lives on the documentation
 * site, which nobody but the vendor deploys.
 *
 * **That site left this repository**, and the assertions that went with it —
 * that its id comes from `DOCS_GTAG_ID` with no default, and that the build
 * ARG actually reaches the build — left with it. They belong wherever the site
 * is built now. What stays here is the half that protects a self-hoster: no
 * analytics id, anywhere, in the surfaces they run.
 *
 * This is the same family as `apps/web/src/app/emails/utils/base-url.ts`,
 * whose header records the identical mistake with the vendor's URLs: a
 * `TARGET_ENV` → vendor-resource table is never the right shape, because
 * `TARGET_ENV` cannot answer "is this the vendor's own deployment".
 *
 * See docs/lessons/a-hardcoded-analytics-id-tracks-every-self-hoster.md.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * The four id shapes Google issues, at their real lengths — a GA4 measurement
 * id (`G-`), a Tag Manager container (`GTM-`), a legacy Universal Analytics
 * property (`UA-`) and a Google Ads conversion account (`AW-`).
 */
const ANALYTICS_ID =
  /\b(?:G-[A-Z0-9]{9,}|GTM-[A-Z0-9]{6,}|UA-\d{4,}-\d+|AW-\d{9,})\b/;

/**
 * The browser-side entry points that load one, for the case where an id
 * arrives from somewhere this file cannot see — an env var, a CMS field, a
 * config fetch. The rule is about the application not measuring its users at
 * all, not merely about where the string is typed.
 */
const ANALYTICS_LOADER =
  /googletagmanager\.com|google-analytics\.com|@next\/third-parties|\bGoogleTagManager\b|\bGoogleAnalytics\b/;

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.docusaurus',
  'generated',
  'coverage',
  '__tests__',
]);

const TEST_FILE = /\.(?:test|spec)\.tsx?$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return SKIP_DIRS.has(entry) ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry) && !TEST_FILE.test(entry) ? [full] : [];
  });
}

/**
 * Comments are stripped before matching, because several files — this one
 * included — explain the pattern they forbid. A rule that cannot survive
 * being described is a rule nobody will keep.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}


const files = [
  ...sourceFiles(join(REPO_ROOT, 'apps')),
  ...sourceFiles(join(REPO_ROOT, 'packages')),
].map((file) => ({
  path: relative(REPO_ROOT, file),
  code: stripComments(readFileSync(file, 'utf8')),
}));

const PRODUCT_APPS = ['apps/web/', 'apps/admin/'];

describe('analytics ids', () => {
  it('finds source files to scan, so this cannot pass on an empty sweep', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('are never hardcoded in any workspace', () => {
    const offenders = files
      .filter(({ code }) => ANALYTICS_ID.test(code))
      .map(({ path }) => path);

    expect(
      offenders,
      [
        'An analytics id is spelled out in source:',
        '',
        ...offenders.map((path) => `  ${path}`),
        '',
        'Read it from the environment instead, with no default. Every',
        'deployment of this repository gets whatever is committed here,',
        'including the ones the vendor does not run.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('are not loaded by the applications a customer self-hosts', () => {
    const offenders = files
      .filter(({ path }) => PRODUCT_APPS.some((app) => path.startsWith(app)))
      .filter(({ code }) => ANALYTICS_LOADER.test(code))
      .map(({ path }) => path);

    expect(
      offenders,
      [
        'apps/web or apps/admin loads an analytics script:',
        '',
        ...offenders.map((path) => `  ${path}`),
        '',
        'These are the surfaces a customer self-hosts, and their paths carry',
        'thread and document identifiers. Traffic measurement belongs to',
        'the documentation site, which only the vendor deploys.',
      ].join('\n'),
    ).toEqual([]);
  });
});

describe('the patterns themselves', () => {
  // Guards the regexes. A refactor that broke one would otherwise leave this
  // whole file green while checking nothing.
  it('match the ids Google issues', () => {
    expect(ANALYTICS_ID.test('gtmId="GTM-MPJ4T77X"')).toBe(true);
    expect(ANALYTICS_ID.test("trackingID: 'G-1A2B3C4D5E'")).toBe(true);
    expect(ANALYTICS_ID.test("'UA-123456-1'")).toBe(true);
    expect(ANALYTICS_ID.test("'AW-123456789'")).toBe(true);
  });

  it('do not match ordinary hyphenated words', () => {
    expect(ANALYTICS_ID.test('bge-multilingual-gemma2')).toBe(false);
    expect(ANALYTICS_ID.test('G-force')).toBe(false);
    expect(ANALYTICS_ID.test('GTM-')).toBe(false);
    expect(ANALYTICS_ID.test('UA-')).toBe(false);
  });

  it('match the loaders, including the placeholder id this file describes', () => {
    expect(ANALYTICS_LOADER.test("from '@next/third-parties/google'")).toBe(
      true,
    );
    expect(ANALYTICS_LOADER.test('<GoogleTagManager gtmId={id} />')).toBe(true);
    expect(
      ANALYTICS_LOADER.test('https://www.googletagmanager.com/gtm.js'),
    ).toBe(true);
    // The prose in layout.tsx writes the removed id as `GTM-…`, which must not
    // read as an id — otherwise the explanation would trip the rule.
    expect(ANALYTICS_ID.test('gtmId="GTM-…"')).toBe(false);
  });
});
