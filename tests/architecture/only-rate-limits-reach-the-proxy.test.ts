import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Budgets and model allowlists are enforced by the application. A second copy
 * at the LiteLLM proxy can only ever be the stale one, and the drift it caused
 * was invisible from either side — the admin panel grew a whole page
 * (`findStrandedOrgs`, `budgetHasDrifted`, `findOfferableButUnserved`) whose
 * only job was detecting it, and ADR-34 records two live defects that came out
 * of it.
 *
 * What still reaches the proxy is per-team `tpm`/`rpm`, because nothing else
 * enforces those yet. That is a bridge, not a destination: LiteLLM is being
 * removed entirely, so this test is also the marker for the obligation —
 * **Phase B must reimplement per-team rate limiting before the proxy goes**,
 * or the removal quietly takes a feature with it.
 *
 * A comment cannot fail a build. This can.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');

const SYNC_SITES = [
  'apps/web/src/features/teams/services/commands/update-litellm-team-command.ts',
  'apps/web/src/features/teams/services/commands/provision-litellm-team-command.ts',
];

/** Field names in the proxy's team payload that the application now owns. */
const APPLICATION_OWNED = ['maxBudget', 'budgetDuration', 'models'];

function source(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/** Strip comments, so prose explaining the rule cannot trip it. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

describe('only rate limits reach the LiteLLM proxy', () => {
  it.each(SYNC_SITES)('%s sends nothing the application owns', (file) => {
    const body = code(source(file));

    for (const field of APPLICATION_OWNED) {
      expect(
        body.includes(`${field}:`),
        `${file} passes \`${field}\` to the proxy. The application enforces it, ` +
          `so the proxy's copy can only go stale — that is the drift this was ` +
          `removed to stop.`,
      ).toBe(false);
    }
  });

  it.each(SYNC_SITES)('%s still sends the rate limits', (file) => {
    const body = code(source(file));

    expect(
      body.includes('tpmLimit') && body.includes('rpmLimit'),
      `${file} no longer sends tpm/rpm. The proxy is the only thing enforcing ` +
        `them — if this was deliberate, per-team rate limiting has to exist ` +
        `somewhere else first.`,
    ).toBe(true);
  });

  it('the admin panel no longer writes budgets or allowlists to the proxy', () => {
    const body = code(source('apps/admin/src/lib/litellm.ts'));

    expect(body.includes('syncOrgToLiteLLM')).toBe(false);
    expect(body.includes('updateLiteLLMTeam')).toBe(false);
  });
});
