import { describe, expect, it } from 'vitest';

import { readSource, trackedFiles } from './tracked-files';

/**
 * No app builds with `next/font/google`.
 *
 * It downloads the font CSS and files while `next build` runs, which makes a
 * build depend on what Google answers. Google sometimes answers with an
 * extensionless `fonts.gstatic.com/l/font?kit=…&skey=…` URL that Turbopack
 * cannot parse (vercel/next.js#99114), and the build fails with "next/font/
 * google queries have exactly one entry" — no code change, no way to tell it
 * from a real break except by re-running it. It failed two of three `main`
 * builds on 2026-10-09.
 *
 * It is also a self-hosting problem in its own right: building the image
 * should not need a third party to be reachable. The faces are served from
 * `apps/web/src/app/fonts/` and `apps/admin/src/app/fonts/` with
 * `next/font/local` instead.
 */
describe('fonts are not fetched at build time', () => {
  const sources = trackedFiles({
    under: ['apps', 'packages'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
    skipDirs: ['node_modules', '__tests__', 'dist', '.next'],
  });

  it('found the app sources', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('imports next/font/google nowhere', () => {
    const offenders = sources.filter((file) =>
      /from\s+['"]next\/font\/google['"]|require\(\s*['"]next\/font\/google['"]\s*\)/.test(
        readSource(file),
      ),
    );

    expect(
      offenders,
      'next/font/google downloads fonts during `next build` and fails it when Google returns an extensionless URL (vercel/next.js#99114) — use next/font/local with the files in src/app/fonts',
    ).toEqual([]);
  });
});
