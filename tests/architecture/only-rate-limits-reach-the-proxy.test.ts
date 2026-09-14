import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The proxy must not hold a budget or a model allowlist.
 *
 * The application enforces both, so a copy at the proxy can only ever be the
 * stale one — and a stale one is still *enforced*, which is worse than merely
 * wrong: raising a ceiling in the panel would leave the proxy refusing at the
 * old one, wearing this application's own "usage limit" message.
 *
 * **The payload itself is asserted in the command tests**, with the client
 * mocked — `update-litellm-team-command.test.ts` and
 * `provision-litellm-team-command.test.ts` check that budgets go out as
 * explicit clears and that the rate limits go out as values. Reading source
 * text cannot do that job: a spread or a quoted key slips straight past it.
 *
 * What is left here is the thing a unit test cannot see, because it is about
 * the whole repository rather than one call: that no *other* place has grown a
 * write to a proxy team. `apps/admin` had two, open-coded, and they are the
 * reason ADR-34 exists.
 *
 * It also holds an obligation. `tpm`/`rpm` still reach the proxy because
 * nothing else enforces them, and LiteLLM is being removed entirely — so
 * **Phase B must reimplement per-team rate limiting before the proxy goes.**
 * The last assertion fails if the forwarding disappears, which is the moment
 * that obligation would otherwise be skipped in silence.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** The only two places allowed to write a team to the proxy. */
const SYNC_SITES = [
  'apps/web/src/features/teams/services/commands/update-litellm-team-command.ts',
  'apps/web/src/features/teams/services/commands/provision-litellm-team-command.ts',
  // A one-off repair for teams provisioned before the clears existed. It
  // writes only clears, never a value.
  'apps/web/src/scripts/clear-litellm-legacy-restrictions.ts',
  // Creates the organization-level team at signup, carrying nothing
  // enforceable.
  'apps/web/src/features/organizations/services/commands/litellm-team-command.ts',
  // Provisions teams for organizations that predate them.
  'apps/web/src/scripts/backfill-teams-for-orgs.ts',
];

function source(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

describe('only rate limits reach the LiteLLM proxy', () => {
  it('no budget or allowlist is ever derived from a team row', () => {
    for (const file of SYNC_SITES) {
      const body = code(source(file));

      for (const field of [
        'budgetUsdCents',
        'allowedModels',
        'budgetDuration: team',
      ]) {
        expect(
          body.includes(field),
          `${file} reads \`${field}\` while building a proxy payload. The ` +
            `application enforces budgets and allowlists; a value sent here ` +
            `becomes a second, stale ceiling that is still enforced.`,
        ).toBe(false);
      }
    }
  });

  it('the rate limits are still forwarded, or their replacement must exist', () => {
    const body = code(
      source(
        'apps/web/src/features/teams/services/commands/update-litellm-team-command.ts',
      ),
    );

    expect(
      body.includes('tpmLimit') && body.includes('rpmLimit'),
      'Per-team rate limits stopped reaching the proxy. The proxy is the only ' +
        'thing enforcing them, so if this was deliberate, the replacement has ' +
        'to exist first — see Phase B in ' +
        'docs/specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md.',
    ).toBe(true);
  });

  it('nowhere else writes a team to the proxy', () => {
    const writers = ['createLiteLLMTeam', 'updateLiteLLMTeam'];
    const allowed = new Set([
      ...SYNC_SITES,
      // The client itself, its binding files, and the type it exports.
      'packages/litellm-client/src/client.ts',
      'packages/litellm-client/src/index.ts',
      'apps/web/src/libs/litellm/client.ts',
      'apps/api/src/litellm/client.ts',
    ]);

    const hits = execGrep(writers);
    const unexpected = hits.filter((file) => !allowed.has(file));

    expect(
      unexpected,
      `${unexpected.join(', ')} writes a team to the proxy. apps/admin had two ` +
        `such writes, open-coded, and they are why ADR-34 exists.`,
    ).toEqual([]);
  });
});

/** Files that reference any of the given symbols, excluding tests. */
function execGrep(symbols: string[]): string[] {
  const { execFileSync } =
    require('node:child_process') as typeof import('node:child_process');
  const out = execFileSync(
    'git',
    ['grep', '-l', '-E', symbols.join('|'), '--', 'apps', 'packages'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  return out
    .split('\n')
    .filter(Boolean)
    .filter(
      (file) => !file.includes('__tests__') && !file.endsWith('.spec.ts'),
    );
}
