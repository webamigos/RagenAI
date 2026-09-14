import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `tsc` derives `rootDir` from the common ancestor of its input files. Every
 * source file in `apps/api` lives under `src/`, so that ancestor is `src/` and
 * `nest build` emits `dist/main.js` — the path `start:prod` and the Dockerfile
 * `CMD` both name.
 *
 * Add one `.config.ts` at the app root and leave it in the build's inputs, and
 * the ancestor climbs to the app root: the whole tree shifts down to
 * `dist/src/…`, `dist/main.js` stops existing, and the container exits with
 * `Cannot find module '/app/apps/api/dist/main.js'`.
 *
 * Nothing static catches that. `nest build` exits 0, `turbo run build` reports
 * success, typecheck and lint are unaffected — the compile genuinely worked,
 * it just wrote somewhere else. The only job that noticed was `test-e2e`,
 * which actually starts the built server, and it failed 60s later with a
 * message about a missing module rather than about a misplaced one.
 *
 * It happened with `vitest.config.ts` and `vitest.e2e.config.ts` during the
 * jest→vitest migration (ADR-48), and `prisma.config.ts` had already been
 * excluded for the same reason before that — twice is a pattern, so it is a
 * test now rather than a third comment.
 */
describe('apps/api build output stays where the start command looks for it', () => {
  const appDir = join(process.cwd(), 'apps/api');

  /** Root-level `*.config.ts` files — the ones that can move `rootDir`. */
  const rootConfigs = readdirSync(appDir)
    .filter((name) => name.endsWith('.config.ts'))
    .sort();

  const buildTsconfig = readFileSync(
    join(appDir, 'tsconfig.build.json'),
    'utf8',
  );

  it('has root-level config files to worry about', () => {
    // If this ever empties out, the guard below is vacuous and someone should
    // find out why rather than deleting it silently.
    expect(rootConfigs.length).toBeGreaterThan(0);
  });

  it.each(rootConfigs)('excludes %s from the build', (name) => {
    // Read as text rather than parsed: tsconfig.build.json carries comments,
    // and what matters is that the name is listed, not how it is quoted.
    expect(buildTsconfig).toContain(`"${name}"`);
  });

  it('names dist/main.js in every command that starts the app', () => {
    const pkg = readFileSync(join(appDir, 'package.json'), 'utf8');
    const dockerfile = readFileSync(join(appDir, 'Dockerfile'), 'utf8');

    // Both must agree with the emit layout the excludes above preserve. A
    // change to one of these without the other is the same outage.
    expect(pkg).toContain('dist/main.js');
    expect(dockerfile).toContain('dist/main.js');
  });
});
