import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A `pull_request` trigger must not filter on the base branch.
 *
 * `branches:` under `pull_request` matches the branch a PR is *opened
 * against*, not the branch it comes from. So `branches: [main]` silently
 * excludes every stacked pull request — one opened against another branch
 * while its parent is still in review — and "excludes" here means no workflow
 * matches, no check appears, and the PR sits looking merely unfinished rather
 * than untested.
 *
 * GitHub does not re-fire the event when a base is auto-retargeted to `main`
 * after the parent merges, so the gap does not close on its own either. #1120
 * and #1121 both merged having been verified only on a laptop; #1122 sat with
 * nothing but a CodeRabbit review until it was pushed to again.
 *
 * `push` keeps its filter and this test does not touch it — without
 * `branches: [main]` there, every stacked branch would run twice, once for the
 * push and once for the pull request.
 *
 * Path filters are also untouched. Not running the Helm job for a change that
 * cannot affect it is a different decision, made per workflow, and a correct
 * one.
 */

const WORKFLOWS = join(import.meta.dirname, '..', '..', '.github', 'workflows');

/**
 * Read as text rather than parsed YAML: the rule is about one line in one
 * block, the failure should quote it, and adding a YAML parser to the test
 * suite to assert the absence of a key is a poor trade.
 */
function pullRequestBranchFilter(source: string): string | undefined {
  const lines = source.split('\n');
  let trigger: string | undefined;
  let inOn = false;

  for (const line of lines) {
    if (/^on:\s*$/.test(line)) {
      inOn = true;
      continue;
    }
    if (!inOn) {
      continue;
    }
    // A new top-level key ends the `on:` block.
    if (line && !line.startsWith(' ') && !line.startsWith('#')) {
      break;
    }

    const nested = /^ {2}([a-z_]+):/.exec(line);
    if (nested) {
      trigger = nested[1];
      continue;
    }

    if (trigger === 'pull_request' && /^ {4}branches:/.test(line)) {
      return line.trim();
    }
  }

  return undefined;
}

describe('every pull request runs CI, whatever it targets', () => {
  const files = readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml'));

  it('finds the workflows it is guarding', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)('%s does not filter pull_request by base branch', (name) => {
    const found = pullRequestBranchFilter(
      readFileSync(join(WORKFLOWS, name), 'utf8'),
    );

    expect(
      found,
      `${name} filters pull_request on the base branch ("${found}"), so a pull request opened against anything but that branch runs no CI at all.`,
    ).toBeUndefined();
  });
});
