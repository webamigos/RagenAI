import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A workspace whose Dockerfile installs with `npm ci --workspace=…` gets only
 * that workspace's dependencies. Anything its tsconfig names in `types` has to
 * be declared by the workspace itself — the root's copy is not there.
 *
 * This is not hypothetical. The jest-to-vitest migration put
 * `"types": ["node", "vitest/globals"]` in `apps/worker` without adding
 * `vitest` to its dependencies. Every local and CI check stayed green, because
 * both install from the root where vitest is hoisted. The production image,
 * which installs scoped, failed:
 *
 *   error TS2688: Cannot find type definition file for 'vitest/globals'.
 *
 * A day of green checks, then a broken deploy. The gap between "the root has
 * it" and "this workspace declares it" is what this closes.
 *
 * Workspaces whose Dockerfile installs from the root are deliberately not
 * checked: hoisting is how they are built, so a missing declaration there is
 * untidy rather than broken, and a guard that fails on untidy gets disabled.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** Discovered rather than listed, so a new scoped Dockerfile is covered. */
function workspacesInstalledScoped(): string[] {
  const candidates = ['apps/web', 'apps/api', 'apps/admin', 'apps/worker'];
  return candidates.filter((workspace) => {
    try {
      const dockerfile = readFileSync(
        join(REPO_ROOT, workspace, 'Dockerfile'),
        'utf8',
      );
      return /npm ci\s+--workspace=/.test(dockerfile);
    } catch {
      return false;
    }
  });
}

/** `node` and `multer` ship as `@types/*`; `vitest/globals` comes from `vitest`. */
function packageFor(typesEntry: string): string {
  const [head] = typesEntry.split('/');
  return head === 'vitest' ? 'vitest' : `@types/${head}`;
}

function readJsonc(path: string): Record<string, unknown> {
  const raw = readFileSync(join(REPO_ROOT, path), 'utf8');
  // Strip comments without touching anything inside a string literal — a URL
  // in a `$schema` value contains `//` and a naive strip eats the rest of it.
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '/' && raw[i + 1] === '/') {
      while (i < raw.length && raw[i] !== '\n') {
        i += 1;
      }
      out += '\n';
      continue;
    }
    if (char === '/' && raw[i + 1] === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) {
        i += 1;
      }
      i += 1;
      continue;
    }
    out += char;
  }
  return JSON.parse(out) as Record<string, unknown>;
}

describe('a scoped install can resolve every tsconfig `types` entry', () => {
  const scoped = workspacesInstalledScoped();

  it('finds at least one workspace to check', () => {
    // If this ever drops to zero the suite below is vacuous, which is the way
    // a guard like this dies quietly.
    expect(scoped.length).toBeGreaterThan(0);
  });

  it.each(scoped)('%s declares what its tsconfig names', (workspace) => {
    const { compilerOptions = {} } = readJsonc(
      `${workspace}/tsconfig.json`,
    ) as { compilerOptions?: { types?: string[] } };
    const types = compilerOptions.types ?? [];

    const pkg = readJsonc(`${workspace}/package.json`) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);

    const missing = types.map(packageFor).filter((name) => !declared.has(name));

    expect(
      missing,
      `${workspace}/tsconfig.json names ${missing.join(', ')} in \`types\`, but ` +
        `${workspace}/package.json does not depend on ${missing.length > 1 ? 'them' : 'it'}. ` +
        "A root install hides this; that Dockerfile's scoped `npm ci` does not, " +
        'and the image build fails with TS2688 after every check has passed.',
    ).toEqual([]);
  });
});
