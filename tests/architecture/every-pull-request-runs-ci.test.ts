import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * A `pull_request` trigger must not filter on the base branch.
 *
 * `branches:` under `pull_request` matches the branch a PR is opened
 * *against*, not the branch it comes from. So `branches: [main]` silently
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
 * Parsed, not scanned as text.
 *
 * The first version of this read the file line by line, on the reasoning that
 * the rule was about one line in one block and a YAML parser was too much to
 * add for it. That reasoning was wrong twice over: `yaml` is already a
 * dependency of the root package, so nothing is being added — and a line
 * scanner only recognises the shape it was written against. It read
 *
 *     pull_request:
 *       branches: [main]
 *
 * and missed the identical `pull_request: { branches: [main] }`, which is the
 * same trigger written as a flow mapping. A guard that a reformat can switch
 * off is worse than none, because the failure it exists to catch is silent.
 *
 * Both spellings of the base filter are rejected. `branches-ignore` is the
 * same mistake inverted — still a filter on the base branch, still excluding
 * every pull request whose base is not listed.
 */
export function baseBranchFilter(source: string): string | undefined {
  const document: unknown = parse(source);

  if (typeof document !== 'object' || document === null) {
    return undefined;
  }

  // `on` is a YAML 1.1 boolean, and parsers disagree about it. Check both.
  const record = document as Record<string, unknown>;
  const on = record.on ?? record.true;

  if (typeof on !== 'object' || on === null) {
    return undefined;
  }

  const pullRequest = (on as Record<string, unknown>).pull_request;

  if (typeof pullRequest !== 'object' || pullRequest === null) {
    return undefined;
  }

  const trigger = pullRequest as Record<string, unknown>;

  for (const key of ['branches', 'branches-ignore']) {
    if (trigger[key] !== undefined) {
      return `${key}: ${JSON.stringify(trigger[key])}`;
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
    const found = baseBranchFilter(readFileSync(join(WORKFLOWS, name), 'utf8'));

    expect(
      found,
      `${name} filters pull_request on the base branch (${found}), so a pull request opened against anything but that branch runs no CI at all.`,
    ).toBeUndefined();
  });
});

describe('the guard recognises a filter however it is written', () => {
  it('catches the block mapping', () => {
    expect(
      baseBranchFilter('on:\n  pull_request:\n    branches: [main]\n'),
    ).toBe('branches: ["main"]');
  });

  it('catches the flow mapping the line scanner missed', () => {
    // Identical trigger, different spelling. This is the case that motivated
    // parsing rather than scanning.
    expect(
      baseBranchFilter('on:\n  pull_request: { branches: [main] }\n'),
    ).toBe('branches: ["main"]');
  });

  it('catches it inside a fully inline `on`', () => {
    expect(
      baseBranchFilter('on: { pull_request: { branches: [main] } }\n'),
    ).toBe('branches: ["main"]');
  });

  it('catches branches-ignore, which is the same mistake inverted', () => {
    expect(
      baseBranchFilter('on:\n  pull_request:\n    branches-ignore: [wip]\n'),
    ).toBe('branches-ignore: ["wip"]');
  });

  it('accepts a trigger with no base filter', () => {
    expect(
      baseBranchFilter("on:\n  pull_request:\n    paths: ['apps/**']\n"),
    ).toBeUndefined();
  });

  it('accepts a bare pull_request', () => {
    expect(
      baseBranchFilter('on:\n  push:\n    branches: [main]\n  pull_request:\n'),
    ).toBeUndefined();
  });

  it('leaves push alone', () => {
    // The filter belongs there: without it every stacked branch runs twice.
    expect(baseBranchFilter('on:\n  push:\n    branches: [main]\n')).toBe(
      undefined,
    );
  });

  it('says nothing about a workflow with no pull_request trigger', () => {
    expect(
      baseBranchFilter('on:\n  schedule:\n    - cron: "0 3 * * *"\n'),
    ).toBe(undefined);
  });
});
