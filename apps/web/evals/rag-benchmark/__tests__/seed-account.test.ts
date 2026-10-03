import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../../../e2e/constants';

/**
 * Both live harnesses sign in as the account the e2e seed creates. The seed
 * takes it from `e2e/constants.ts`, which honours TEST_USER_EMAIL and
 * TEST_USER_PASSWORD; a harness with its own literal signs in as a different
 * account whenever those are set, and fails with a 401 that looks like a
 * broken stack. `run.ts` starts a run when imported, so this reads its source.
 */
const HARNESSES = ['rag-benchmark/run.ts', 'e2e-rag/run.ts'];

describe.each(HARNESSES)('%s', (harness) => {
  const source = readFileSync(
    join(import.meta.dirname, '..', '..', harness),
    'utf8',
  );

  it('takes the seeded account from e2e/constants', () => {
    expect(source).toMatch(/from '\.\.\/\.\.\/e2e\/constants'/);
    expect(source).toMatch(/RAG_EVAL_EMAIL \?\? TEST_USER_EMAIL/);
    expect(source).toMatch(/RAG_EVAL_PASSWORD \?\? TEST_USER_PASSWORD/);
  });

  it('carries no literal of its own', () => {
    expect(source).not.toContain('e2e-test@ragen.ai');
    expect(source).not.toContain('E2eTestPassword123!');
  });
});

describe('e2e/constants', () => {
  it('still provides the account the harnesses read', () => {
    expect(TEST_USER_EMAIL).toBeTruthy();
    expect(TEST_USER_PASSWORD).toBeTruthy();
  });
});
