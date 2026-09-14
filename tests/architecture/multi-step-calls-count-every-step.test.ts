import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A generation that can take several steps must report the tokens of all of
 * them.
 *
 * The AI SDK offers two fields and documents the difference in one line each:
 * `usage` is "the token usage of the last step", `totalUsage` is "the total
 * token usage of all steps". Both are on the same result object, both
 * typecheck, and both are a `LanguageModelUsage` — so picking the wrong one is
 * invisible to tsc, to eslint, and to any test that asserts on a single-step
 * call.
 *
 * All three chat chains passed `stopWhen: stepCountIs(MAX_TOOL_STEPS)` and read
 * `usage`. A turn that called an MCP tool therefore recorded only its final
 * step: everything the model spent deciding to call the tool, and every
 * round-trip after it, was dropped before the `AiUsage` row was written — and
 * so before `checkUsageLimitsQuery` aggregated those rows into the monthly cost
 * and token ceilings. The ceilings were enforcing a number that was too small
 * by however much the tools cost.
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
    '%s reads totalUsage rather than usage',
    (file) => {
      const source = readFileSync(join(REPO_ROOT, file), 'utf8');

      const reads = source
        .split('\n')
        .map((line, index) => ({ line: line.trim(), number: index + 1 }))
        // A comment naming the field is not a read of it — this fix left several
        // explaining why `totalUsage` is the right one.
        .filter(({ line }) => !/^(\/\/|\*|\/\*)/.test(line))
        .filter(({ line }) =>
          /\bresult\.usage\b|\busage:\s*\w+\.usage\b/.test(line),
        );

      expect(
        reads,
        `${file} passes \`stopWhen\`, so it can run several steps, but reads ` +
          `\`usage\` — the last step's tokens only. Use \`totalUsage\`.`,
      ).toEqual([]);
    },
    15_000,
  );
});
