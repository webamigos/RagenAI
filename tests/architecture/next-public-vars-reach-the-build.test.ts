import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * `apps/web` reads no `NEXT_PUBLIC_*` variable, and its Dockerfile declares
 * none — which is what lets one published image serve every install.
 *
 * **This test used to assert the opposite**, and the inversion is the point.
 * Next replaces the literal expression `process.env.NEXT_PUBLIC_FOO` with a
 * string while compiling, so a name with no matching `ARG` was empty in every
 * browser no matter what the deployed service set. The old rule — every name
 * read must have a build argument — was the right rule while the values were
 * baked. It made the baking *correct*; it could not make it *configurable*.
 *
 * It could not, because the mechanism has no runtime. `NEXT_PUBLIC_APP_URL`,
 * the Pusher credentials and the trusted-link allowlist differ per install, so
 * an image built with one deployment's answers is wrong for the next one. That
 * is why `apps/web` was the single application `publish-images.yml` refused to
 * publish, while the worker, api, admin and mcp images went out.
 *
 * The values now come from `apps/web/src/config/public-runtime-config.ts`,
 * which reads the environment the container is actually running in and hands
 * it to the browser through an element the root layout renders. So the rule
 * flips: a `NEXT_PUBLIC_*` read reintroduces the baking, silently, and this is
 * what says so.
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
      // shipped bundle reads them.
      return entry.name === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

/**
 * Comments are not reads — decided by TypeScript's own scanner.
 *
 * The rule is about what the compiler inlines, and prose *explaining* the rule
 * names the same variables: `public-runtime-config.ts` documents the mechanism
 * with a `process.env.NEXT_PUBLIC_FOO` example, and this test collected it as
 * a variable the Dockerfile had to declare. A guard that fires on its own
 * explanation is a guard somebody deletes.
 *
 * **The first version stripped comments with a regex, and that was wrong in
 * the one direction a guard cannot afford.** `//` occurs inside string
 * literals constantly — every `https://` — so a line like
 * `const u = "https://x"; process.env.NEXT_PUBLIC_FOO;` lost its real access,
 * and the Dockerfile check would then pass without ever seeing the name. The
 * comment there called that "safe, it can hide a read, never invent one":
 * hiding a read is precisely the failure this test exists to prevent, and
 * inventing one is merely noisy.
 *
 * So the scanner decides. Comment trivia is dropped; string and template
 * literals are kept, because a name appearing inside one is a false positive
 * — the direction that costs somebody a minute rather than a release.
 */
const withoutComments = (source: string): string => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    ts.LanguageVariant.JSX,
    source,
  );

  let out = '';
  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  ) {
    const isComment =
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia;
    out += isComment ? ' ' : scanner.getTokenText();
  }

  return out;
};

/** Every name the app reads, and where — the message is only useful with both. */
function namesReadByTheApp(): Map<string, string[]> {
  const found = new Map<string, string[]>();

  for (const file of sourceFiles(WEB_SRC)) {
    for (const match of withoutComments(readFileSync(file, 'utf8')).matchAll(
      READ,
    )) {
      const name = match[1] as string;
      const where = file.slice(REPO_ROOT.length + 1);
      found.set(name, [...(found.get(name) ?? []), where]);
    }
  }

  return found;
}

// Walking every source file in `apps/web` takes well under a second idle, but
// `npm run verify` runs this alongside five app builds and the 5s default is
// not enough headroom under that load.
describe(
  'apps/web needs no build-time configuration',
  { timeout: 30_000 },
  () => {
    it('reads no NEXT_PUBLIC_* variable', () => {
      const offenders = [...namesReadByTheApp()].map(
        ([name, files]) => `${name} (read in ${files[0]})`,
      );

      expect(
        offenders,
        'Next inlines this at build time, in server code as well as client ' +
          'code, so the value would be the publishing build’s in every ' +
          'install. Read it through `publicRuntimeConfig()` in ' +
          '`@/config/public-runtime-config` instead — it takes the runtime ' +
          'name first and still falls back to the NEXT_PUBLIC one, so no ' +
          'deployment has to be reconfigured.',
      ).toEqual([]);
    });

    it('declares no NEXT_PUBLIC_* build argument', () => {
      const declared = [
        ...readFileSync(DOCKERFILE, 'utf8').matchAll(
          /^ARG\s+(NEXT_PUBLIC_[A-Z0-9_]+)/gm,
        ),
      ].map((match) => match[1] as string);

      expect(
        declared,
        'a build argument is how the baking comes back: it makes the value ' +
          'part of the image, which is the one thing a published image must ' +
          'not carry per install.',
      ).toEqual([]);
    });

    /**
     * The other half of the same claim. Without this the suite would pass on
     * an `apps/web` that reads nothing *because it was deleted*, and the point
     * is that the reader exists and is the one place these values come from.
     */
    it('has a runtime reader for them instead', () => {
      const reader = readFileSync(
        join(WEB_SRC, 'config', 'public-runtime-config.ts'),
        'utf8',
      );

      expect(reader).toContain('export function readPublicRuntimeConfig');
      expect(reader).toContain('export function publicRuntimeConfig');
    });
  },
);
