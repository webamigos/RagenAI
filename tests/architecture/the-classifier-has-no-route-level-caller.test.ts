import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The jailbreak classifier runs in the loop, and nowhere else.
 *
 * Phase C2 absorbed it as a scored built-in and deleted two route-level
 * calls. The reason that is worth a guard rather than just a diff: the old
 * arrangement is the *easier* one to write. It is three lines at a route, it
 * needs nothing from the chain, and it works — on that route. `apps/api`
 * never had those three lines, so the public API had no jailbreak detection
 * at all while the panel listed the rule, and nothing anywhere said so.
 *
 * A second detector wired that way would rebuild the same gap, and it would
 * pass every other test in this repository.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const APP_ROOTS = ['apps/web/src', 'apps/api/src', 'apps/admin/src'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'generated',
  'coverage',
]);

/**
 * Comments first, as the sibling guards do: the files explaining why the
 * classifier is gone name it, and a comment naming a variable does not read
 * it. Without this the guard fails on its own explanation, which is a
 * guard nobody keeps.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* sourceFiles(full);
    } else if (/\.tsx?$/.test(entry)) {
      yield full;
    }
  }
}

const appFiles = APP_ROOTS.flatMap((root) => [
  ...sourceFiles(join(REPO_ROOT, root)),
]);

describe('the jailbreak classifier has no route-level caller', () => {
  it('reads the app trees it claims to check', () => {
    // Without this, a renamed directory makes every assertion below pass over
    // an empty list — the failure that let a browser-safety guard read one app
    // of two for a whole phase.
    expect(appFiles.length).toBeGreaterThan(500);
  });

  it('the standalone module is gone', () => {
    // Kept as its own assertion rather than folded into the grep below: a file
    // nothing imports is dead code that reads as a second implementation, and
    // the next person to want jailbreak detection finds it before they find
    // the rule.
    expect(
      existsSync(
        join(REPO_ROOT, 'apps/web/src/libs/security/jailbreak-classifier.ts'),
      ),
      'jailbreak-classifier.ts is back. The detector is the ' +
        '`jailbreak-detection` guardrail rule; its prompt lives in ' +
        'packages/guardrails so every runtime asks the same question.',
    ).toBe(false);
  });

  it.each(['classifyJailbreakRisk', 'isAboveJailbreakThreshold'])(
    'no app calls %s',
    (symbol) => {
      const offenders = appFiles.filter((file) =>
        new RegExp(`\\b${symbol}\\s*\\(`).test(
          stripComments(readFileSync(file, 'utf8')),
        ),
      );

      expect(
        offenders.map((f) => relative(REPO_ROOT, f)),
        `${symbol} was the route-level classifier. Detection belongs in the ` +
          'guardrail loop, which is the only place that covers apps/api, the ' +
          'embedded widget and the panel from one call site.',
      ).toEqual([]);
    },
  );

  it.each(['JAILBREAK_DETECTION_ENABLED', 'JAILBREAK_DETECTION_THRESHOLD'])(
    'no app reads %s',
    (variable) => {
      // The rule's `enabled` and `threshold` are the panel's now. A variable
      // that still switched something would be a second answer to the same
      // question, and the panel would be the one that looked right.
      const offenders = appFiles.filter((file) =>
        stripComments(readFileSync(file, 'utf8')).includes(variable),
      );

      expect(
        offenders.map((f) => relative(REPO_ROOT, f)),
        `${variable} is retired. Enable the rule and set its threshold in ` +
          "apps/admin's /guardrails page. `scripts/guardrails-preflight.mts` " +
          'still reads it, deliberately, and is not an app.',
      ).toEqual([]);
    },
  );

  it('the embedded widget still says which surface it is', () => {
    // Positive, because the failure is an absence: without this the widget's
    // hits are filed as `chat`, which is not lost but is unfindable — an
    // operator filtering /incidents by `chatbot` sees nothing. The deleted
    // classifier call got this right, so losing it would have been a
    // regression introduced by a cleanup.
    const route = readFileSync(
      join(REPO_ROOT, 'apps/web/src/app/api/chatbot/[token]/chat/route.ts'),
      'utf8',
    );

    expect(
      route,
      'The chatbot route no longer passes guardrailSource. It shares ' +
        '`initializeRagChain` with the panel, which defaults to `chat`.',
    ).toContain("guardrailSource: 'chatbot'");
  });
});
