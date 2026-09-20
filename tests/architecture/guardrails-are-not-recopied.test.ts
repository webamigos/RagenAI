import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * What a guardrail *does* is decided in one package, not in each runtime.
 *
 * Three surfaces read guardrail rows — `apps/web`, `apps/api` and
 * `apps/admin` — and they legitimately differ in how they reach a database,
 * how they record an event and which error they raise. They must not differ in
 * what a rule means. A masking rule that covers chat history in one runtime
 * and not the other is two products, and the public API is the one nobody
 * would notice was wrong.
 *
 * This is not a hypothetical. Phase B shipped with four such decisions written
 * twice, and each copy was two lines long and obviously correct on its own:
 *
 * - `rules.some(r => r.action === 'MASK')` in both loaders — the decision that
 *   makes the input stage blocking rather than concurrent. Drift there means
 *   one runtime builds its retrieval query from the unmasked text.
 * - `action === 'BLOCK' ? 'GUARDRAIL_BLOCKED' : 'GUARDRAIL_FLAGGED'` in both
 *   event adapters. Drift there means the same hit is filed under different
 *   types depending on the surface it arrived through, and the incidents page
 *   under-reports blocks from one of them.
 *
 * Both are now single functions in `@ragenai/guardrails`. This test is what
 * stops the next phase re-introducing them: C adds a judge and D adds output
 * rules, and each arrives with the same temptation.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const PACKAGE_SRC = join('packages', 'guardrails', 'src');

const APP_ROOTS = ['apps/web/src', 'apps/api/src', 'apps/admin/src'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'generated',
  'coverage',
  '__tests__',
  '__mocks__',
]);

/**
 * Evaluation primitives, which an app has no business calling directly.
 *
 * Reaching for one of these is the first line of a re-implementation:
 * `runPatternRules` plus a loop over the hits *is* the input stage, written
 * again. Apps call `evaluateInputStage`, which takes the three things they
 * genuinely own as callbacks.
 */
const PACKAGE_ONLY_SYMBOLS = [
  'runPatternRules',
  'evaluatePattern',
  'compilePattern',
  'applyMask',
  'mergeSpans',
  'maskPlaceholder',
  'maskLabelFor',
];

/**
 * Decisions that must exist once.
 *
 * Matched as source text rather than through the type system, because the
 * duplication this guards against typechecks perfectly — that is the whole
 * reason it survived review twice.
 */
const DUPLICATED_DECISIONS: Array<{
  name: string;
  pattern: RegExp;
  instead: string;
}> = [
  {
    name: 'what an action means',
    // Three spellings of the same decision, because one of them is not a
    // guard. The original matched `action === 'BLOCK'` only: a double-quoted
    // literal, a reversed comparison, or a `switch` over the action all read
    // as compliant while doing exactly what this forbids. A negative match
    // narrower than the thing it forbids is the first shape in
    // docs/lessons/three-shapes-of-a-test-that-guards-nothing.md, and this
    // file is where that lesson was learned.
    pattern:
      /(?:action\s*[!=]==\s*['"](?:BLOCK|MASK|LOG)['"]|['"](?:BLOCK|MASK|LOG)['"]\s*[!=]==\s*action|case\s+['"](?:BLOCK|MASK|LOG)['"]\s*:)/,
    instead:
      'call `securityEventTypeFor()` from @ragenai/guardrails, or let ' +
      '`evaluateInputStage()` apply the action. An app deciding what an ' +
      'action means is the duplication this test exists for.',
  },
  {
    name: 'which event type a hit is filed under',
    pattern: /GUARDRAIL_(BLOCKED|FLAGGED)/,
    instead:
      'call `securityEventTypeFor()`. Naming the event type in an app is how ' +
      'two runtimes come to file the same hit differently.',
  },
];

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* sourceFiles(full);
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      yield full;
    }
  }
}

/** Comments first: the files explaining this rule quote what it forbids. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const appFiles = APP_ROOTS.flatMap((root) => [
  ...sourceFiles(join(REPO_ROOT, root)),
]);

describe('guardrails are not recopied', () => {
  it('reads the app trees it claims to check', () => {
    // Without this, a renamed directory would make every assertion below pass
    // over an empty list — the failure mode that let a browser-safety guard
    // read one app of two for a whole phase.
    expect(appFiles.length).toBeGreaterThan(500);
    for (const root of APP_ROOTS) {
      expect(
        appFiles.some((file) => file.includes(root.replace(/\//g, '/'))),
        `${root} contributed no files`,
      ).toBe(true);
    }
  });

  it.each(PACKAGE_ONLY_SYMBOLS)('no app imports %s directly', (symbol) => {
    const offenders = appFiles.filter((file) => {
      const code = stripComments(readFileSync(file, 'utf8'));
      // Only an import of it from the package counts. A local variable that
      // happens to share the name is not a re-implementation.
      return new RegExp(
        `import[\\s\\S]{0,400}?\\b${symbol}\\b[\\s\\S]{0,400}?from\\s*'@ragenai/guardrails`,
      ).test(code);
    });

    expect(
      offenders.map((f) => relative(REPO_ROOT, f)),
      `${symbol} is an evaluation primitive and belongs to ${PACKAGE_ONLY_SYMBOLS.length > 0 ? PACKAGE_SRC : ''}. ` +
        'Apps call `evaluateInputStage`, which takes their moderation ' +
        'client, their event writer and their error type as callbacks. ' +
        'Importing a primitive is the first line of writing the stage again.',
    ).toEqual([]);
  });

  it.each(DUPLICATED_DECISIONS)(
    'no app decides $name for itself',
    ({ pattern, instead }) => {
      const offenders = appFiles.filter((file) =>
        pattern.test(stripComments(readFileSync(file, 'utf8'))),
      );

      expect(
        offenders.map((f) => relative(REPO_ROOT, f)),
        `These files decide something the package decides: ${instead}`,
      ).toEqual([]);
    },
  );

  it('the package still holds the decisions this test redirects to', () => {
    // The guard on the guard. If these moved or were renamed, every assertion
    // above would keep passing while pointing readers at nothing.
    const inputStage = readFileSync(
      join(REPO_ROOT, PACKAGE_SRC, 'evaluator', 'input-stage.ts'),
      'utf8',
    );

    // `hasTransformingRule` was named here too, until the chains stopped
    // scheduling the input stage around a MASK rule and started always
    // running it first — a refused question must not reach the rephraser.
    // It had exactly one purpose and no caller left, so it went rather than
    // becoming an export kept alive by its own guard.
    expect(inputStage).toContain('export function securityEventTypeFor');
    expect(inputStage).toContain('export async function evaluateInputStage');
  });
});
