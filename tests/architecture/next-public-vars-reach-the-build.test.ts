import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A `NEXT_PUBLIC_*` variable the web Dockerfile does not name is empty in
 * every browser that loads the app.
 *
 * Next inlines `process.env.NEXT_PUBLIC_*` into the bundle at build time, so
 * for these the build *is* the runtime. Setting one on the deployed service
 * changes nothing, and nothing anywhere reports that: the code takes its
 * fallback branch and the feature is simply absent.
 *
 * The failure mode is worse than absence when the server still reads the value
 * at runtime. `NEXT_PUBLIC_DEMO_EMAIL` was set on the demo deployment and not
 * declared here: the sign-in page server-rendered the credentials box from the
 * live environment, then hydration replaced it with the bundle's compiled-in
 * `undefined` and the box vanished a moment after it appeared. A blink is all
 * the operator gets.
 *
 * Two rules, and the second is the one that bites hardest:
 *
 *  1. Every `NEXT_PUBLIC_*` name read under `apps/web/src` has an `ARG` in
 *     `apps/web/Dockerfile`, so an operator can set it, and an `ENV` pairing
 *     it back to that arg.
 *  2. No `NEXT_PUBLIC_*` is given a literal value there. The Dockerfile keeps
 *     a block of placeholder credentials so `next build` can collect page
 *     data, labelled "not used at runtime" — true of a server-side secret and
 *     false of an inlined one. `NEXT_PUBLIC_PUSHER_KEY="dummy"` sat in that
 *     block, and because `notification-client.ts` chooses Pusher over SSE on
 *     the key's presence alone, every Docker-built deployment connected to a
 *     Pusher app that does not exist instead of falling back.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const WEB_SRC = join(REPO_ROOT, 'apps', 'web', 'src');
const DOCKERFILE = join(REPO_ROOT, 'apps', 'web', 'Dockerfile');

/**
 * At least one character after the prefix, so the `process.env.NEXT_PUBLIC_*`
 * that appears in a comment is not collected as a variable named nothing.
 */
const READ = /process\.env\.(NEXT_PUBLIC_[A-Z0-9][A-Z0-9_]*)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Test files name variables they stub, which is not a claim that the
      // shipped bundle needs them.
      return entry.name === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

let cached: Map<string, string[]> | undefined;

/**
 * Names the browser bundle depends on, and where each is read. Memoized: this
 * walks every source file in `apps/web`, and the suite runs alongside the
 * builds `npm run verify` starts in parallel.
 */
function namesReadByTheApp(): Map<string, string[]> {
  if (cached) {
    return cached;
  }

  const found = new Map<string, string[]>();

  for (const file of sourceFiles(WEB_SRC)) {
    const contents = readFileSync(file, 'utf8');
    for (const match of contents.matchAll(READ)) {
      const name = match[1] as string;
      const where = file.slice(REPO_ROOT.length + 1);
      found.set(name, [...(found.get(name) ?? []), where]);
    }
  }

  cached = found;
  return found;
}

/** `ARG NEXT_PUBLIC_FOO` / `ARG NEXT_PUBLIC_FOO=default`. */
function declaredArgs(dockerfile: string): Set<string> {
  return new Set(
    [...dockerfile.matchAll(/^ARG\s+(NEXT_PUBLIC_[A-Z0-9_]+)/gm)].map(
      (match) => match[1] as string,
    ),
  );
}

/**
 * Every `NEXT_PUBLIC_*` assignment in an `ENV` instruction, as name → value.
 * Line continuations are folded first, because the placeholder block is one
 * `ENV` spanning thirty backslash-terminated lines.
 */
function envAssignments(dockerfile: string): Map<string, string> {
  const folded = dockerfile.replace(/\\\r?\n/g, ' ');
  const assignments = new Map<string, string>();

  for (const line of folded.split('\n')) {
    if (!/^ENV\s/.test(line.trim())) {
      continue;
    }
    for (const match of line.matchAll(
      /(NEXT_PUBLIC_[A-Z0-9_]+)=("[^"]*"|\S*)/g,
    )) {
      assignments.set(match[1] as string, (match[2] as string).trim());
    }
  }

  return assignments;
}

// Walking every source file in `apps/web` takes well under a second idle, but
// `npm run verify` runs this alongside five app builds and the 5s default is
// not enough headroom under that load.
describe(
  'NEXT_PUBLIC_* variables reach the browser bundle',
  { timeout: 30_000 },
  () => {
    const dockerfile = readFileSync(DOCKERFILE, 'utf8');

    it('declares a build arg for every name apps/web reads', () => {
      const args = declaredArgs(dockerfile);
      const missing = [...namesReadByTheApp()]
        .filter(([name]) => !args.has(name))
        .map(([name, files]) => `${name} (read in ${files[0]})`);

      expect(
        missing,
        'Next inlines these at build time, so a name with no ARG in ' +
          'apps/web/Dockerfile is empty in every browser no matter what the ' +
          'deployed service sets. Add `ARG <name>` and `ENV <name>=${<name>}` ' +
          'to the browser-facing block near the top of the builder stage.',
      ).toEqual([]);
    });

    it('assigns each one from its own build arg, and never a literal', () => {
      const assignments = envAssignments(dockerfile);

      // An ARG on its own does reach `RUN npm run web:build`, but only through
      // Docker's implicit build-arg-to-environment behaviour. The ENV pair is
      // what this file's every other name does and what the case above tells
      // you to write, so a name declared without one is a deviation the next
      // reader has to reason about rather than a pattern they can copy.
      const unassigned = [...namesReadByTheApp().keys()]
        .filter((name) => !assignments.has(name))
        .map((name) => `${name} (ARG declared, no ENV)`);

      const literal = [...assignments]
        .filter(([name, value]) => value !== `\${${name}}`)
        .map(([name, value]) => `${name}=${value}`);

      expect(
        [...unassigned, ...literal],
        'A placeholder here is not a build-only placeholder — it is compiled ' +
          'into the bundle and is what every visitor runs on. Declare an ARG ' +
          'and assign `${<name>}`; put the default on the ARG if the code ' +
          'needs one.',
      ).toEqual([]);
    });

    it('finds the names it is meant to be guarding', () => {
      // A regex that quietly matched nothing would make both cases above pass
      // for the wrong reason.
      const read = namesReadByTheApp();

      expect(read.size).toBeGreaterThan(5);
      expect([...read.keys()]).toContain('NEXT_PUBLIC_DEMO_EMAIL');
      expect([...read.keys()]).not.toContain('NEXT_PUBLIC_');
    });
  },
);
