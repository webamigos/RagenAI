import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every activity a handler asks `ctx.steps` for must exist in
 * `createMockActivities()`.
 *
 * Nothing else catches this. The handlers are typed against
 * `typeof activities`, so a name that exists in `src/activities/` compiles and
 * every unit test passes — the registry is only consulted at *run* time, by
 * the suites that run a real handler. So adding an activity and forgetting the
 * stub is green in `turbo run test` and red only in `npm run worker:test:jobs`,
 * which has its own config and is not part of that run.
 *
 * `mock-activities.ts` already warned about it in prose: "a handler asking for
 * an unregistered activity fails with a message about wiring rather than about
 * the activity's absence here". It happened anyway, one activity later, and
 * the message was exactly as described — `no activity named
 * "computeFileAccessPrincipals" is registered with the worker`, which reads
 * like a runtime defect rather than a missing line in a fixture.
 *
 * Keyed on what the handlers destructure rather than on what
 * `src/activities/` exports: that directory also exports constants and plain
 * helpers, which no fixture should have to stub.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const HANDLERS = join(REPO_ROOT, 'apps', 'worker', 'src', 'handlers');
const FIXTURE = join(
  REPO_ROOT,
  'apps',
  'worker',
  'src',
  '__tests__',
  'fixtures',
  'mock-activities.ts',
);

/** The names destructured from each `ctx.steps<typeof activities>({…})` call. */
function requestedActivities(source: string): string[] {
  const names = new Set<string>();

  // `const { a, b } = ctx.steps<…>` and the multi-line form that ends in
  // `} = ctx.steps<…>`. Both are in use; the second is what the long handlers
  // wrap to.
  for (const match of source.matchAll(
    /(?:const\s*)?\{([^{}]*?)\}\s*=\s*ctx\.steps</gs,
  )) {
    for (const line of match[1].split(',')) {
      // Drop comments, whitespace and any `a: b` renaming (none today).
      const name = line
        .replace(/\/\/[^\n]*/g, '')
        .split(':')[0]
        .trim();
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        names.add(name);
      }
    }
  }

  return [...names];
}

const fixture = readFileSync(FIXTURE, 'utf8');
const handlers = readdirSync(HANDLERS).filter((f) => f.endsWith('.ts'));

describe('a handler activity has a stub', () => {
  it('finds handlers to check, so an empty sweep cannot pass', () => {
    expect(handlers.length).toBeGreaterThan(5);
  });

  it.each(handlers)('%s', (file) => {
    const requested = requestedActivities(
      readFileSync(join(HANDLERS, file), 'utf8'),
    );

    const missing = requested.filter(
      (name) => !new RegExp(`^\\s*${name}:`, 'm').test(fixture),
    );

    expect(
      missing,
      `${file} asks ctx.steps for ${missing.join(', ')}, which createMockActivities() does not stub. ` +
        'Every suite that runs a real handler will fail with "no activity named … is registered ' +
        'with the worker" — add the stub to apps/worker/src/__tests__/fixtures/mock-activities.ts.',
    ).toEqual([]);
  });
});
