import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Nothing a client component can reach is server-only.
 *
 * `apps/web` used to configure this in a `webpack` block — a
 * `NormalModuleReplacementPlugin` redirecting `generated/prisma/client` to
 * `generated/prisma/browser`, another swapping `serverLogger` for
 * `clientLogger`, and `resolve.fallback` stubs so node builtins resolved to
 * nothing in the browser. **None of it ever ran.** The app builds with bare
 * `next build` on Next 16, where Turbopack is the bundler and a `webpack` key
 * is never invoked. See
 * `docs/lessons/a-webpack-config-block-is-inert-under-turbopack.md`.
 *
 * Removing dead config does not create a risk here, because Turbopack has no
 * `resolve.fallback` escape hatch: a client component importing
 * `@/generated/prisma/client` **fails the build**. What it does not do is say
 * so usefully. The whole message is:
 *
 *     FATAL: An unexpected Turbopack error occurred. A panic log has been
 *     written to /var/folders/…/next-panic-<hash>.log
 *     - the chunking context (unknown) does not support external modules
 *       (request: node:module)
 *
 * No file, no import, no rule — a panic report inviting you to file a bug
 * against Next. This test exists to name the file and the rule instead, and it
 * runs in seconds rather than after a four-minute build.
 *
 * **How reachability is decided.** From every `'use client'` file, follow
 * *value* imports (`import type` and `import { type X }` are erased before
 * bundling) and stop at any `'use server'` module: Next replaces those with an
 * RPC stub, so nothing behind one reaches the browser. Walking through a server
 * action is the mistake that makes this look alarming — it reports 43 "leaks"
 * that are all server actions doing their job.
 *
 * **Its limits, stated rather than discovered.** Imports are matched with a
 * regular expression, so a dynamic `import(someVariable)` or a `require()`
 * built from a template is invisible to it. That is the same trade every test
 * in this directory makes — they read source as text — and it is why this
 * guards the named, common mistake rather than claiming to prove an absence.
 */

/**
 * Generous on purpose: this is a CPU budget, not a correctness one.
 *
 * Each case walks the import graph from every `'use client'` file in both
 * apps, which is ~800ms of pure work on an idle machine and several times that
 * under `npm run verify`, where four Next builds are competing for the same
 * cores. It has already timed out there once at vitest's 5s default, with the
 * failing case measuring 264ms alone — and a timeout reads as a regression in
 * whatever change happens to be in flight. See
 * `docs/lessons/a-five-second-test-timeout-fires-under-verifys-concurrency.md`.
 */
const WALK_TIMEOUT_MS = 60_000;

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const WEB_SRC = join(REPO_ROOT, 'apps', 'web', 'src');
const ADMIN_SRC = join(REPO_ROOT, 'apps', 'admin', 'src');

/**
 * Both Next apps, because this guard read only one of them and the leak it
 * exists to catch shipped in the other.
 *
 * `apps/admin`'s `/guardrails` page imported `@ragenai/guardrails` from two
 * `'use client'` components. The barrel re-exports the ReDoS probe, which
 * imports `node:worker_threads` — so the page server-rendered, hydrated, threw
 * `Cannot find module 'node:worker_threads'` and replaced itself with the
 * error boundary. `next build` was green, every unit test was green, and the
 * page was blank.
 *
 * Both apps alias `@/*` to their own `src`, which is why the root travels with
 * the file rather than being a module-level constant.
 */
const SCAN_ROOTS: Array<{ label: string; src: string; minClients: number }> = [
  { label: 'apps/web', src: WEB_SRC, minClients: 100 },
  { label: 'apps/admin', src: ADMIN_SRC, minClients: 20 },
];

/** The scan root a file belongs to, for resolving its `@/` imports. */
function rootFor(file: string): string {
  return file.startsWith(ADMIN_SRC) ? ADMIN_SRC : WEB_SRC;
}

/**
 * Modules that must never be reachable from the browser, and why.
 *
 * Matched as substrings of the import specifier, so `@/generated/prisma/client`
 * and a relative path ending in the same thing both count.
 */
const SERVER_ONLY: Array<{
  specifier: string;
  because: string;
  /**
   * Match the specifier exactly rather than as a substring.
   *
   * Needed where a package's safe entry point is spelled as its barrel plus a
   * subpath: `@ragenai/guardrails/contracts` contains `@ragenai/guardrails`,
   * so the default substring match would ban the fix along with the mistake.
   */
  exact?: boolean;
}> = [
  {
    specifier: '@/generated/prisma/client',
    because:
      "it imports node:process, node:path, node:url and Prisma's server runtime. " +
      'Client components import `@/generated/prisma/browser` instead — 53 of ' +
      'them do — which is the entry Prisma generates for exactly this.',
  },
  {
    specifier: '@ragenai/prisma-client',
    because:
      'it is the alias for `src/libs/db`, the server Prisma singleton, so it ' +
      'pulls in `@/generated/prisma/client` and the tenant-scope extension ' +
      'with it. A client component has no business holding a database handle.',
  },
  {
    specifier: '@ragenai/guardrails',
    exact: true,
    because:
      'its barrel re-exports the ReDoS probe, which imports ' +
      '`node:worker_threads` at module scope. Turbopack cannot externalise a ' +
      'node builtin into a client chunk, so the page server-renders, hydrates, ' +
      "throws `Cannot find module 'node:worker_threads'` and replaces itself " +
      'with the error boundary — green build, blank page. Client components ' +
      'import `@ragenai/guardrails/contracts`, which has no imports at all.',
  },
  {
    specifier: 'app/lib/utils/logger/serverLogger',
    because:
      'it requires pino-pretty and throws on import when `window` is defined. ' +
      'Import `@/app/lib/utils/logger`, which picks the right one at runtime.',
  },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!/(__tests__|__mocks__|generated)$/.test(entry)) {
        out.push(...sourceFiles(path));
      }
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const read = (file: string): string => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

/**
 * A directive prologue may be preceded by comments — SWC skips them when it
 * reads it, and three files here open with a licence-style block. Matching the
 * raw start of the file would drop those client components from the scan and,
 * worse, walk straight through a commented `'use server'` module.
 */
const stripLeadingComments = (source: string): string => {
  let rest = source.trimStart();
  for (;;) {
    if (rest.startsWith('//')) {
      const newline = rest.indexOf('\n');
      if (newline === -1) {
        return '';
      }
      rest = rest.slice(newline + 1).trimStart();
    } else if (rest.startsWith('/*')) {
      const close = rest.indexOf('*/');
      if (close === -1) {
        return '';
      }
      rest = rest.slice(close + 2).trimStart();
    } else {
      return rest;
    }
  }
};

const hasDirective = (source: string, directive: string): boolean =>
  new RegExp(`^(['"])${directive}\\1`).test(stripLeadingComments(source));

/**
 * Import specifiers whose module is actually evaluated in the bundle.
 *
 * `import type { X } from './y'` and `import { type X } from './y'` are erased
 * by the compiler and cannot pull anything into a chunk, so counting them would
 * flag every component that types a prop with a Prisma enum.
 */
function valueImports(source: string): string[] {
  const specifiers: string[] = [];

  for (const match of source.matchAll(
    /import\s+(type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g,
  )) {
    const [, typeKeyword, clause, specifier] = match;
    if (typeKeyword) {
      continue;
    }
    // `import { type A, type B } from 'x'` is also fully erased. A default or
    // namespace binding outside the braces means something is evaluated.
    const outsideBraces = clause.replace(/\{[\s\S]*\}/, '').trim();
    const named = /\{([\s\S]*)\}/.exec(clause)?.[1] ?? '';
    const hasValueBinding =
      outsideBraces.length > 0 ||
      named
        .split(',')
        .some((part) => part.trim().length > 0 && !/^type\s/.test(part.trim()));
    if (hasValueBinding || named.trim().length === 0) {
      specifiers.push(specifier);
    }
  }

  // Side-effect imports and re-exports evaluate the module too.
  for (const match of source.matchAll(
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
  )) {
    specifiers.push(match[1]);
  }
  for (const match of source.matchAll(
    /export\s+(?:\*|\{[\s\S]*?\})\s+from\s*['"]([^'"]+)['"]/g,
  )) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

/**
 * Where a `@ragenai/<name>` specifier's source lives, when it is one of this
 * repo's own workspace packages.
 *
 * Resolving these is what turns the denylist below from a list of names into a
 * rule. `@ragenai/connector-guard` was not on that list — it was created after
 * the last entry was added — and its barrel imports `node:net`, so
 * `/mcp-catalogue` shipped broken in exactly the shape the guardrails page had
 * shipped broken four days earlier. A denylist of four names cannot fail on
 * the fifth; walking into the package and looking for the builtin can.
 *
 * Only `@ragenai/*`, and only into `packages/<name>/src`: following anything
 * from `node_modules` would make this a bundler rather than a test. Two
 * aliases do not follow that pattern and stay with the named entries —
 * `@ragenai/prisma-client` is an alias for `apps/web/src/libs/db`, and
 * `@ragenai/common-ui` for a directory inside apps/web.
 */
const WORKSPACE_SCOPE = '@ragenai/';
const PACKAGES = join(REPO_ROOT, 'packages');

function workspacePackageEntry(specifier: string): string | null {
  if (!specifier.startsWith(WORKSPACE_SCOPE)) {
    return null;
  }
  const withoutScope = specifier.slice(WORKSPACE_SCOPE.length);
  const [name, ...subpath] = withoutScope.split('/');
  const base = join(PACKAGES, name, 'src', ...subpath);
  for (const candidate of [
    `${base}.ts`,
    join(base, 'index.ts'),
    `${base}.tsx`,
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function resolveSpecifier(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) {
    base = join(rootFor(fromFile), specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    // A bare specifier. One of this repo's own packages resolves into
    // `packages/<name>/src`; anything else is a real dependency and stops here,
    // because following node_modules would make this a bundler rather than a
    // test.
    return workspacePackageEntry(specifier);
  }
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/** The import chain from a client entry point to a forbidden module, if any. */
function pathToServerOnly(
  entry: string,
  specifier: string,
  exact = false,
): string[] | null {
  const matches = (imported: string): boolean =>
    exact ? imported === specifier : imported.includes(specifier);

  const seen = new Set<string>();
  const stack: Array<{ file: string; trail: string[] }> = [
    { file: entry, trail: [entry] },
  ];

  while (stack.length > 0) {
    const { file, trail } = stack.pop()!;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);

    const source = read(file);
    // Next replaces a `'use server'` import with an RPC stub, so the module and
    // everything it imports stay on the server.
    if (file !== entry && hasDirective(source, 'use server')) {
      continue;
    }

    for (const imported of valueImports(source)) {
      if (matches(imported)) {
        return [...trail, imported];
      }
      const next = resolveSpecifier(imported, file);
      if (next !== null && !seen.has(next)) {
        stack.push({ file: next, trail: [...trail, next] });
      }
    }
  }

  return null;
}

const clientEntryPointsByRoot = SCAN_ROOTS.map((root) => ({
  ...root,
  entries: sourceFiles(root.src).filter((file) =>
    hasDirective(read(file), 'use client'),
  ),
}));
const clientEntryPoints = clientEntryPointsByRoot.flatMap((r) => r.entries);

describe('client bundles stay browser-safe', () => {
  it.each(clientEntryPointsByRoot)(
    'finds the client components it claims to check in $label',
    ({ label, entries, minClients }) => {
      // Without this, a change to how the directive is written — or a scan
      // root that quietly stops resolving — would make every assertion below
      // pass over an empty list. Per root, because a healthy apps/web count
      // hid apps/admin not being read at all.
      expect(
        entries.length,
        `${label} contributed ${entries.length} client components to the scan`,
      ).toBeGreaterThan(minClients);
    },
  );

  it.each(SERVER_ONLY)(
    'no client component can reach $specifier',
    ({ specifier, because, exact }) => {
      const offenders = clientEntryPoints
        .map((entry) => pathToServerOnly(entry, specifier, exact === true))
        .filter((trail): trail is string[] => trail !== null);

      const report = offenders
        .map(
          (trail) =>
            `  ${trail
              .map((step) =>
                step.startsWith('/') ? relative(REPO_ROOT, step) : step,
              )
              .join('\n    -> ')}`,
        )
        .join('\n\n');

      expect(
        offenders,
        `A client component reaches ${specifier}, which is server-only: ${because}\n\n${report}\n\n` +
          `Turbopack fails this build with a panic that names neither the file ` +
          `nor the import, which is why this test exists.`,
      ).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );

  /**
   * The rule the named entries above are examples of.
   *
   * Every leak this file has caught was ultimately a `node:` builtin in a
   * client chunk — `node:worker_threads` through `@ragenai/guardrails`,
   * `node:net` through `@ragenai/connector-guard`, `node:process` and friends
   * through Prisma's server client. Each was found by a person and then added
   * here by name, which means the guard was always one package behind. This
   * asserts the invariant instead, so a package written next month is covered
   * before anyone imports it wrongly.
   *
   * `node:` only, and not the extensionless spellings (`fs`, `path`): those
   * are also real package names, and a client component importing a
   * `path`-named dependency is not a defect. Everything in this repo uses the
   * prefixed form, which ESLint enforces.
   */
  it(
    'no client component can reach a node: builtin',
    () => {
      const offenders = clientEntryPoints
        .map((entry) => pathToServerOnly(entry, 'node:'))
        .filter((trail): trail is string[] => trail !== null);

      const report = offenders
        .map(
          (trail) =>
            `  ${trail
              .map((step) =>
                step.startsWith('/') ? relative(REPO_ROOT, step) : step,
              )
              .join('\n    -> ')}`,
        )
        .join('\n\n');

      expect(
        offenders,
        'A client component reaches a Node builtin. Turbopack cannot put one ' +
          'in a browser chunk, so the page server-renders, hydrates, throws ' +
          '`Cannot find module` and replaces itself with the error boundary — ' +
          'a green build and a 200 over a blank page.\n\n' +
          `${report}\n\n` +
          'The fix is a browser-safe entry point holding the types and ' +
          'constants the component actually wanted, with the Node-only code ' +
          'left in the barrel. See `@ragenai/guardrails/contracts` and ' +
          '`mcp-catalogue/validation-shape.ts` for the two shapes this takes.',
      ).toEqual([]);
    },
    WALK_TIMEOUT_MS,
  );

  it('stops at a server action instead of walking through it', () => {
    // The guard on the guard. Without the `'use server'` check this reports
    // dozens of client components as leaking Prisma, because that is exactly
    // what a server action is for — and the noise would get the test deleted.
    const actions = join(WEB_SRC, 'app', 'actions', 'index.ts');
    expect(existsSync(actions)).toBe(true);
    expect(hasDirective(read(actions), 'use server')).toBe(true);
    expect(
      valueImports(read(actions)).some((specifier) =>
        specifier.includes('@/generated/prisma/client'),
      ),
      'this file is the fixture for the rule above: it must keep importing the ' +
        'server Prisma entry, so that a broken `use server` check would fail ' +
        'rather than pass quietly',
    ).toBe(true);
  });

  it('sees a directive that comes after a comment', () => {
    // Three files here open with a comment block before `'use client'`, which
    // is legal and which SWC honours. Missing them would quietly shrink the
    // scan; missing a commented `'use server'` would walk through it instead.
    expect(hasDirective("// why\n'use client';", 'use client')).toBe(true);
    expect(hasDirective("/* why */\n'use server';", 'use server')).toBe(true);
    expect(hasDirective("/*\n * why\n */\n'use client';", 'use client')).toBe(
      true,
    );
    expect(
      hasDirective("import x from 'y';\n'use client';", 'use client'),
    ).toBe(false);
  });

  it('treats a type-only import as erased', () => {
    // A component typing a prop with a Prisma enum is not shipping Prisma.
    expect(valueImports("import type { X } from '@/a';")).toEqual([]);
    expect(valueImports("import { type X } from '@/a';")).toEqual([]);
    expect(valueImports("import { type X, type Y } from '@/a';")).toEqual([]);
  });

  it('counts a value import, however it is written', () => {
    expect(valueImports("import { X } from '@/a';")).toEqual(['@/a']);
    expect(valueImports("import X from '@/a';")).toEqual(['@/a']);
    expect(valueImports("import * as X from '@/a';")).toEqual(['@/a']);
    expect(valueImports("import { type X, Y } from '@/a';")).toEqual(['@/a']);
    expect(valueImports("import '@/a';")).toEqual(['@/a']);
    expect(valueImports("export * from '@/a';")).toEqual(['@/a']);
  });
});

describe('the bundler config says what it does', () => {
  const config = read(join(REPO_ROOT, 'apps', 'web', 'next.config.ts'));

  it('declares no webpack function, which Turbopack would never call', () => {
    // The failure this whole file came from: a config block that reads as live
    // behaviour, is documented in AGENTS.md as live behaviour, and does
    // nothing. Re-adding one is a silent no-op, so it is caught here instead.
    const withoutComments = config
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');

    expect(withoutComments).not.toMatch(/^\s*webpack\s*:/m);
  });
});
