import { describe, expect, it } from 'vitest';

import { readSource, trackedFiles } from './tracked-files';

/**
 * The architecture project runs without per-file isolation
 * (`vitest.config.ts`): every guard in a worker shares one module registry,
 * so `tracked-files.ts` lists the repository and reads each file once per
 * worker. That is only sound while the guards are pure readers. A guard that
 * mocked a module, stubbed an environment variable, spied on a function or
 * froze the clock would leak that into whichever guard ran next in the same
 * worker — a failure that depends on scheduling and reproduces nowhere.
 *
 * So the rule is enforced rather than remembered: no code in this directory
 * does any of it. Comments may name the calls; code may not.
 */
const MUTATIONS =
  /\bvi\.(mock|doMock|stubEnv|stubGlobal|spyOn|useFakeTimers|setSystemTime)\s*\(|process\.env\.[A-Z_][A-Z0-9_]*\s*=(?!=)/;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const guards = trackedFiles({
  under: 'tests/architecture',
  extensions: ['.ts'],
});

describe('architecture guards can share a worker', () => {
  it('finds the guards it is checking', () => {
    expect(guards.length).toBeGreaterThan(50);
  });

  it('none mocks, stubs, spies or changes global state', () => {
    const offenders = guards.filter(
      (file) =>
        !file.endsWith('architecture-guards-share-a-worker-safely.test.ts') &&
        MUTATIONS.test(stripComments(readSource(file))),
    );
    expect(
      offenders,
      'A guard that changes shared state cannot run in the shared worker ' +
        'the architecture project uses. Move it to a package test, or give ' +
        'the architecture project its isolation back in vitest.config.ts.',
    ).toEqual([]);
  });

  it('would catch each kind of mutation', () => {
    for (const code of [
      "vi.mock('x')",
      "vi.stubEnv('A', 'b')",
      'vi.spyOn(console, "log")',
      'vi.useFakeTimers()',
      "process.env.DATABASE_URL = 'x'",
    ]) {
      expect(MUTATIONS.test(code), code).toBe(true);
    }
    expect(MUTATIONS.test("process.env.DATABASE_URL === 'x'")).toBe(false);
    expect(MUTATIONS.test("// vi.mock('x') in a comment")).toBe(true);
    expect(MUTATIONS.test(stripComments("// vi.mock('x') in a comment"))).toBe(
      false,
    );
  });
});
