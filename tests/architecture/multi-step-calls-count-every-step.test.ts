import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A generation that can take several steps must report the tokens of all of
 * them.
 *
 * **The field that means this changed name with the major version, which is
 * why the guard survives the upgrade rather than being deleted by it.**
 *
 * On AI SDK 6 the two fields were `usage` ("the token usage of the last step")
 * and `totalUsage` ("the total token usage of all steps"). All three chat
 * chains passed `stopWhen: stepCountIs(MAX_TOOL_STEPS)` and read `usage`, so a
 * turn that called an MCP tool recorded only its final step: everything spent
 * deciding to call the tool, and every round-trip after it, was dropped before
 * the `AiUsage` row was written — and so before `checkUsageLimitsQuery`
 * aggregated those rows into the monthly cost and token ceilings.
 *
 * AI SDK 7 **inverted the answer**: `usage` now spans every step, and
 * `totalUsage` survives only as its `@deprecated` alias. The same intent is
 * spelled `usage` again, so the fix that was correct last week is the wrong
 * spelling this week.
 *
 * What this refuses is therefore the *last-step* reading at a multi-step call
 * site — `finalStep.usage` — and the deprecated alias. Both typecheck, both
 * are a `LanguageModelUsage`, and both are invisible to any test asserting on
 * a single-step call, where every spelling agrees.
 *
 * The rule is about the *combination*, which is why a comment could not hold
 * it: `usage` is correct in a single-step call, and there are several of those
 * (rephrase, the worker's summaries and scoring). It is only wrong beside a
 * `stopWhen`.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** Source roots that can contain a model call. */
const SEARCH_PATHS = ['apps/api/src', 'apps/web/src', 'apps/worker/src'];

function gitGrep(args: string[]): string[] {
  try {
    return execFileSync('git', ['grep', ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch (error) {
    // Exit 1 is "no matches"; anything higher means the search did not run and
    // must not be read as a pass.
    const status = (error as { status?: number }).status;
    if (status !== 1) {
      throw error;
    }
    return [];
  }
}

describe('a multi-step generation counts every step', () => {
  it('has at least one multi-step call to check', () => {
    // Guards the guard: if `stopWhen` disappears entirely, the assertion below
    // starts passing because it has nothing to look at.
    const callers = gitGrep(['-l', 'stopWhen', '--', ...SEARCH_PATHS]).filter(
      (file) => !file.includes('__tests__'),
    );

    expect(callers.length).toBeGreaterThan(0);
  }, 15_000);

  it.each(
    gitGrep(['-l', 'stopWhen', '--', ...SEARCH_PATHS]).filter(
      (file) => !file.includes('__tests__'),
    ),
  )(
    '%s counts every step, not the final one',
    (file) => {
      const source = readFileSync(join(REPO_ROOT, file), 'utf8');

      const reads = source
        .split('\n')
        .map((line, index) => ({ line: line.trim(), number: index + 1 }))
        // A comment naming a field is not a read of it, and these call sites
        // carry several explaining which spelling is current.
        .filter(({ line }) => !/^(\/\/|\*|\/\*)/.test(line))
        // `finalStep.usage` is the last step alone; `totalUsage` is the
        // deprecated AI SDK 6 spelling of what `usage` now means.
        .filter(({ line }) => /\bfinalStep\.usage\b|\btotalUsage\b/.test(line));

      expect(
        reads,
        `${file} passes \`stopWhen\`, so it can run several steps. Read ` +
          `\`usage\`, which spans all of them on AI SDK 7 — not ` +
          `\`finalStep.usage\` (the last step alone) and not ` +
          `\`totalUsage\` (deprecated).`,
      ).toEqual([]);
    },
    15_000,
  );
});
