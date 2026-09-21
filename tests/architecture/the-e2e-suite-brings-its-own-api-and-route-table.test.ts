import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

/**
 * The two preconditions the local e2e run used to inherit from whatever
 * happened to be on the machine.
 *
 * Both failed open, and both produced failures that read as application bugs:
 *
 * - **apps/api.** Phase C of ADR-21 put the project list and the thread export
 *   behind `ragenApiRequest`, and `e2e.yml` starts apps/api for exactly that
 *   reason. Locally nothing did — but an apps/api left running from an earlier
 *   session answers fine, from *its* database. `smoke-11` and `smoke-12` then
 *   fail as if the seeded project and thread were missing, and since the
 *   `authenticated` project depends on `smoke-auth`, two reds like that stop
 *   160 p0–p3 tests from running at all.
 * - **The route table.** `LLM_ROUTES_PATH` was set only in CI, so locally the
 *   gateway fell back to the production `infra/llm-gateway/routes.yaml` and the
 *   credentials in `.env.local`: `mock-model` failed to resolve *and* the turns
 *   that did resolve went to a real provider and billed the operator.
 *
 * Asserted as text because what matters is that the setup file takes
 * responsibility for them at all — a behavioural test would need a machine with
 * the wrong thing already running, which is the situation this prevents.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

describe('the e2e suite brings its own apps/api', () => {
  const setup = read('apps/web/e2e/global.setup.ts');
  const teardown = read('apps/web/e2e/global.teardown.ts');

  it('starts apps/api rather than assuming one is running', () => {
    expect(setup).toContain('apps/api/dist/main.js');
  });

  it('waits for the healthcheck CI waits for', () => {
    // A `spawn` that is not waited on hands the first spec a connection
    // refused, which is a different wrong answer from the one being fixed.
    expect(setup).toContain('/v1/healthcheck');
  });

  it('refuses a port it did not open instead of trusting what answers', () => {
    // The whole defect in one line: the previous behaviour was to trust it.
    // There is no way to ask a running apps/api which database it holds.
    expect(setup).toMatch(/already answering/i);
  });

  it('leaves the port alone in CI, where the workflow owns the process', () => {
    expect(setup).toContain('process.env.CI');
  });

  it('stops only a process it started', () => {
    expect(teardown).toContain('__appsApiProcess');
  });
});

describe('the e2e suite pins the gateway at the mock', () => {
  const config = read('apps/web/playwright.config.ts');
  /**
   * Only the object the config actually assigns from.
   *
   * `toContain(name)` over the whole file would pass on a comment mentioning
   * the variable — which is precisely the shape of the bug being fixed, a name
   * that is documented and not set.
   */
  const assignedEnv =
    /const E2E_LLM_ENV = \{([\s\S]*?)\n\} as const;/.exec(config)?.[1] ?? '';

  it.each([
    'LLM_ROUTES_PATH',
    'LLM_MOCK_BASE_URL',
    'LLM_MOCK_API_KEY',
    'DEFAULT_MODEL',
    'REPHRASE_MODEL',
  ])('sets %s, which CI sets and nothing set locally', (name) => {
    expect(assignedEnv).toMatch(new RegExp(`^\\s*${name}:`, 'm'));
  });

  it('builds an absolute routes path', () => {
    // `routeTableFromEnv` joins a relative path onto `process.cwd()` and does
    // not walk up, and the processes that read it have different working
    // directories. A relative value does not fail — it warns and falls back to
    // the production catalogue, which is the expensive half of this.
    expect(config).toMatch(
      /path\.join\(__dirname,\s*'e2e',\s*'routes\.e2e\.yaml'\)/,
    );
  });

  it('lets an explicit value from the shell win', () => {
    // CI sets all five before node starts. Overwriting them here would make
    // this file, not the workflow, the thing CI actually runs against.
    expect(config).toContain('??=');
  });
});

describe('the seeded guardrail fixtures cover both stages', () => {
  const seed = read('apps/web/e2e/seed/e2e-seed.ts');

  it('seeds an OUTPUT rule, not only the two INPUT ones', () => {
    // `p0-32` was written against a rule created by hand during phase D, which
    // the seed's own `deleteMany` then removed — so the spec asserted against
    // something that existed on one machine for one evening.
    expect(seed).toContain('E2E guardrail OUTPUT BLOCK');
    expect(seed).toContain("stage: 'OUTPUT'");
  });

  it('matches an answer only this spec can provoke', () => {
    // The mock answers every prompt with one fixed sentence and echoes
    // `zzqx-echo-*` back only when asked, so a globally seeded OUTPUT rule on
    // this pattern cannot refuse another spec's turn.
    expect(seed).toContain('zzqx-echo-withheld');
  });
});
