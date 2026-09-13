import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseWorkerEnv } from '../../apps/worker/src/config/env';

/**
 * `.env.example` must be enough to start every app that refuses to boot on a
 * bad environment.
 *
 * It was not. `apps/worker` has required `REDIS_URL` for as long as it has had
 * a schema, while `.env.example` shipped it commented out, AGENTS.md's
 * documented minimum omitted it, and `create-ragen-app` never set it — so a
 * fresh clone that followed the documentation exactly got:
 *
 *     Environment validation failed (1 problem):
 *       - REDIS_URL: Invalid input: expected string, received undefined
 *
 * Nothing caught it because each piece was individually reasonable: a variable
 * may be commented out, a schema may require one, and neither file knows about
 * the other. This test is the only place they meet.
 *
 * apps/worker is the one checked because it is the strictest — it exits on a
 * bad parse and has the most required variables. apps/web and apps/api report
 * and continue by design (ADR-37), so a missing variable there is a different,
 * louder failure.
 *
 * `.env.example` cannot satisfy all of it, and should not try: some variables
 * are a secret or a per-account value, and shipping a placeholder for those
 * would be worse than shipping nothing. Those are listed below, which makes
 * the list the answer to "what must I obtain before the worker runs" — and
 * makes a *new* required variable that is neither secret nor listed fail this
 * test, which is exactly how `REDIS_URL` should have been caught.
 */
const OPERATOR_MUST_SUPPLY: Record<string, string> = {
  // Generated, by `create-ragen-app` or by hand from the instruction in
  // `.env.example`. Shipping a real one would be shipping a known key.
  SECRET_KEY: 'generated-at-install-time',
  // Contains the Scaleway project id — `https://api.scaleway.ai/<project>/v1`
  // — so there is no value that is right for two installs.
  SCW_API_BASE: 'https://api.scaleway.ai/project/v1',
  SCW_API_KEY: 'operator-supplied',
};
const ENV_EXAMPLE = join(import.meta.dirname, '..', '..', '.env.example');

/** The uncommented assignments, as a process would see them. */
function parseEnvExample(): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of readFileSync(ENV_EXAMPLE, 'utf8').split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) {
      values[match[1] as string] = (match[2] as string).replace(
        /^["']|["']$/g,
        '',
      );
    }
  }

  return values;
}

describe('.env.example starts the apps that refuse to boot without it', () => {
  it('reads as a real environment', () => {
    // A parser that matched nothing would make the assertion below pass
    // against an empty object.
    expect(Object.keys(parseEnvExample()).length).toBeGreaterThan(10);
  });

  it('satisfies apps/worker once the operator supplies what only they have', () => {
    const result = parseWorkerEnv({
      ...parseEnvExample(),
      ...OPERATOR_MUST_SUPPLY,
    });

    expect(
      result.ok ? null : result.report,
      'A variable apps/worker requires is missing or commented out in .env.example, so a fresh clone that followed the documentation cannot start the worker.',
    ).toBeNull();
  });

  it('needs nothing from the operator that is not a secret or per-account', () => {
    // The list is the documentation, so it has to stay short and stay true.
    // A required variable with a known working local value belongs in
    // `.env.example` uncommented, not here — that was the REDIS_URL bug.
    expect(Object.keys(OPERATOR_MUST_SUPPLY).sort()).toEqual([
      'SCW_API_BASE',
      'SCW_API_KEY',
      'SECRET_KEY',
    ]);
  });
});
