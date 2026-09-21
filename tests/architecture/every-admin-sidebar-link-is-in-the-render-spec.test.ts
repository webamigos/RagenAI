import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A page in the admin sidebar is a page `smoke-03-every-page-renders` visits.
 *
 * That spec is the only thing in the repository that loads an admin page in a
 * browser and asserts it rendered with no console error. Every admin page is
 * `force-dynamic`, so `next build` proves the route exists and nothing about
 * whether the page can query, hydrate or run. Its own comment says it covers
 * "every page the sidebar links to" — and twice now it has not.
 *
 * `/guardrails` shipped with a `node:worker_threads` import in a client
 * component: server-rendered, hydrated, threw, replaced itself with the error
 * boundary. It had been added to the sidebar and not to the spec.
 * `docs/lessons/an-architecture-guard-that-reads-one-app-of-two.md` records it.
 *
 * Four days later `/mcp-catalogue` shipped with `node:net` in a client
 * component, in the identical shape, and it too was in the sidebar and not in
 * the spec. The lesson had been written, read and not applied, because nothing
 * failed when the table and the sidebar disagreed.
 *
 * So the agreement is checked rather than asked for. Both files are read as
 * text, which is this directory's idiom and is enough here: the sidebar's
 * `href`s and the spec's `ROUTES` keys are literals in both.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SIDEBAR = join(
  REPO_ROOT,
  'apps',
  'admin',
  'src',
  'app',
  'components',
  'Sidebar.tsx',
);
const CONSTANTS = join(REPO_ROOT, 'apps', 'admin', 'e2e', 'constants.ts');
const SPEC = join(
  REPO_ROOT,
  'apps',
  'admin',
  'e2e',
  'smoke-03-every-page-renders.spec.ts',
);

const read = (file: string) => readFileSync(file, 'utf8');

/** Every `href: '/…'` in the sidebar's nav table. */
function sidebarHrefs(): string[] {
  return [...read(SIDEBAR).matchAll(/href:\s*'([^']+)'/g)]
    .map((match) => match[1])
    .filter((href) => href.startsWith('/'));
}

/** The `ROUTES` map in the e2e constants, as name → path. */
function routes(): Record<string, string> {
  const block = /export const ROUTES = \{([\s\S]*?)\} as const;/.exec(
    read(CONSTANTS),
  )?.[1];
  if (!block) {
    return {};
  }
  return Object.fromEntries(
    [...block.matchAll(/(\w+):\s*'([^']+)'/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

/** The `ROUTES` keys the render spec's table names. */
function coveredRouteKeys(): string[] {
  const block = /const PAGES:[\s\S]*?\n\];/.exec(read(SPEC))?.[0] ?? '';
  return [...block.matchAll(/\[\s*'(\w+)'/g)].map((match) => match[1]);
}

describe('the admin render spec', () => {
  it('reads both files, so the comparison below is not between two empty lists', () => {
    expect(sidebarHrefs().length).toBeGreaterThan(15);
    expect(Object.keys(routes()).length).toBeGreaterThan(15);
    expect(coveredRouteKeys().length).toBeGreaterThan(15);
  });

  it('visits every page the sidebar links to', () => {
    const byPath = new Map(
      Object.entries(routes()).map(([name, path]) => [path, name]),
    );
    const covered = new Set(coveredRouteKeys());

    const missing = sidebarHrefs().filter((href) => {
      const name = byPath.get(href);
      return name === undefined || !covered.has(name);
    });

    expect(
      missing,
      'These pages are in the admin sidebar but not in ' +
        '`smoke-03-every-page-renders`, which is the only check that loads an ' +
        'admin page in a browser. Add the path to `ROUTES` in ' +
        '`apps/admin/e2e/constants.ts` and a `[key, heading]` row to the ' +
        "spec's `PAGES` table. Both pages that shipped rendering nothing but " +
        'an error boundary were in the sidebar and missing from that table.',
    ).toEqual([]);
  });
});
