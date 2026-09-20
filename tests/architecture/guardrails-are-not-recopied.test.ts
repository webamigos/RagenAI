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
  // Phase C's primitives, added with the judge they belong to. An app that
  // calls `runPolicyRules` and loops over the hits has written the policy half
  // of the input stage again, and the two copies would then disagree about the
  // cap, about what an error means, or about which rule blocks first.
  //
  // `policyThresholdFor` is here for a sharper reason than the others: a
  // second copy of "0.7 when the rule names none" is a rule that is more
  // sensitive on one surface than the other for the same organization, which
  // is invisible until somebody compares two incident lists.
  'runPolicyRules',
  'policyThresholdFor',
  'hasEvaluablePolicy',
  // C2's primitives. Which prompt a scored rule gets is `judgeRequestFor`,
  // and a binding that imported the builders could choose for itself — the
  // exact decision C2 moved into the package, because two kinds of scored
  // rule made choosing a decision at all.
  'judgeRequestFor',
  'policyJudgePrompt',
  'jailbreakPrompt',
  'isJudgedRule',
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

    // The judge's question and its model, which C1 added. A binding that
    // spelled either for itself would make one runtime's policy rules behave
    // differently from the other's for the same organization — the public API
    // being the surface where nobody would notice.
    const policy = readFileSync(
      join(REPO_ROOT, PACKAGE_SRC, 'evaluator', 'policy.ts'),
      'utf8',
    );
    expect(policy).toContain('export const POLICY_JUDGE_MODEL');
    expect(policy).toContain('export const POLICY_JUDGE_SYSTEM_PROMPT');
    expect(policy).toContain('export function policyJudgePrompt');
    expect(policy).toContain('export const DEFAULT_POLICY_THRESHOLD');
  });

  it('every judge binding reads its model, its prompt and its step', () => {
    // Positive rather than negative, because the failure this guards is an
    // *absence*: a binding that stopped importing `POLICY_JUDGE_MODEL` and
    // hardcoded a model id would pass any test that only looks at files
    // mentioning the constant. A negative match narrower than the thing it
    // forbids is the first shape in
    // docs/lessons/three-shapes-of-a-test-that-guards-nothing.md.
    //
    // The step is asserted here and not only in each app's unit test because
    // it is the whole reason Phase C1 is one step rather than two: *a judge
    // that runs without recording its cost is the thing C2 was supposed to
    // prevent.* Dropping the `trackAiUsage` call breaks nothing anybody can
    // see — the page simply shows spend with no step accounting for it.
    const bindings = appFiles.filter((file) =>
      /policy-judge\.(ts|service\.ts)$/.test(file),
    );

    expect(
      bindings.map((f) => relative(REPO_ROOT, f)).sort(),
      'Both runtimes have a judge. If one of these is missing, either it was ' +
        'renamed or a runtime lost its judge — and a runtime with no judge ' +
        'resolves LLM_POLICY rules and enforces none of them.',
    ).toEqual([
      'apps/api/src/guardrails/policy-judge.service.ts',
      'apps/web/src/features/guardrails/utils/policy-judge.ts',
    ]);

    for (const binding of bindings) {
      const code = stripComments(readFileSync(binding, 'utf8'));
      const where = relative(REPO_ROOT, binding);

      expect(code, `${where} does not read POLICY_JUDGE_MODEL`).toContain(
        'POLICY_JUDGE_MODEL',
      );
      // It takes the prompt rather than building it, which is what C2 changed
      // and why: with two kinds of scored rule — an `LLM_POLICY` and the
      // jailbreak built-in — *choosing* the prompt became a decision, and
      // `judgeRequestFor` in the package is where it is made.
      expect(
        code,
        `${where} does not take its prompt from the judge request. ` +
          'A binding that assembles one has forked the question the two ' +
          'runtimes ask, and the fork is silent because both halves produce ' +
          'a number in the right range.',
        // Anchored to the judge function's own parameter list. The first
        // version of this was `/\{[^}]*system[^}]*prompt[^}]*\}/`, which
        // matched the `generateObject({ model, schema, system, messages: [{
        // ... content: prompt }] })` call a few lines below and passed with
        // the destructure deleted. Verified by deleting it.
      ).toMatch(/async\s*\(\s*\{[^}]*\bsystem\b[^}]*\bprompt\b[^}]*\}/);

      expect(
        code,
        `${where} declares a prompt of its own. The prompts are ` +
          '`POLICY_JUDGE_SYSTEM_PROMPT` and `JAILBREAK_SYSTEM_PROMPT` in ' +
          '@ragenai/guardrails, so every runtime asks the same question.',
      ).not.toMatch(/(SYSTEM_)?PROMPT\s*=/);
      expect(
        code,
        `${where} runs a judge model and never records what it cost. ` +
          'That is the failure Phase C1 was made one step to prevent.',
      ).toContain('GUARDRAIL');
    }
  });
});
