import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

/**
 * `LLM_ROUTES_PATH` in CI has to be absolute.
 *
 * `routeTableFromEnv` joins a relative value onto `process.cwd()` and
 * deliberately does not walk up for it: the walk exists for the *default*
 * table, and an operator naming a path means that path. So the value is only
 * as good as the working directory of whichever process reads it — and a
 * workflow runs several with different ones.
 *
 * That is not hypothetical. `e2e.yml` set `apps/web/e2e/routes.e2e.yaml` at
 * workflow scope. apps/api is started from the repository root, so it
 * resolved; the Next server is started by Playwright with cwd `apps/web`, so
 * the same string became `apps/web/apps/web/e2e/…`, the table was never read,
 * and every model call failed. Chain initialization threw before the
 * guardrail stage ran, so `p0-29` saw `unknown-error` instead of a refusal
 * and the diagnosis went to the cache, then to the model defaults, before
 * anyone looked at the path. Two days.
 *
 * Nothing else would have caught it: the file exists, the glob matches, the
 * YAML is valid, and the job that reads it from the right directory passes.
 */

const WORKFLOWS = join(process.cwd(), '.github', 'workflows');

/** Absolute, or interpolated from a context that produces an absolute path. */
const ACCEPTABLE = [
  /^\//,
  /^\$\{\{\s*github\.workspace\s*\}\}/,
  /^\$\{\{\s*runner\.temp\s*\}\}/,
  /^\$GITHUB_WORKSPACE/,
];

type Setting = { file: string; value: string };

function routeTableSettings(): Setting[] {
  const found: Setting[] = [];

  for (const file of readdirSync(WORKFLOWS)) {
    if (!file.endsWith('.yml') && !file.endsWith('.yaml')) {
      continue;
    }
    const text = readFileSync(join(WORKFLOWS, file), 'utf8');
    for (const line of text.split('\n')) {
      // Matched as text rather than by parsing the workflow: the value is what
      // matters and it is on one line, and a YAML parse would need the schema
      // of every place `env` can appear.
      const match = /^\s*LLM_ROUTES_PATH:\s*(.+?)\s*$/.exec(line);
      if (!match?.[1]) {
        continue;
      }
      found.push({ file, value: match[1].replace(/^['"]|['"]$/g, '') });
    }
  }

  return found;
}

describe('a configured route table path', () => {
  it('is absolute in every workflow that sets one', () => {
    const offenders = routeTableSettings()
      .filter(({ value }) => !ACCEPTABLE.some((ok) => ok.test(value)))
      .map(({ file, value }) => `${file}: ${value}`);

    expect(
      offenders,
      'A relative LLM_ROUTES_PATH resolves against each process’s own ' +
        'working directory, which differs between the jobs and services in a ' +
        'workflow. Use ${{ github.workspace }}/… instead.',
    ).toEqual([]);
  });

  it('finds the setting it is guarding, so a rename cannot make it vacuous', () => {
    // The guard on the guard. If the variable is renamed or the e2e workflow
    // stops setting it, the assertion above passes over an empty list and
    // says nothing — the shape this repository keeps finding in its own
    // tests. See docs/lessons/three-shapes-of-a-test-that-guards-nothing.md.
    expect(routeTableSettings().length).toBeGreaterThan(0);
  });
});
